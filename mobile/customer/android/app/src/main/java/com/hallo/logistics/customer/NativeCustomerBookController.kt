package com.hallo.logistics.customer

import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputLayout
import com.hallo.logistics.customer.databinding.ItemCustomerTruckBinding
import java.text.NumberFormat
import java.util.Locale

/**
 * PDF2-aligned native booking journey.
 * Presentation is split into Route -> Cargo -> Truck -> Quote -> Review -> Success while all
 * routing, pricing and order creation continue to use the existing CustomerViewModel/backend.
 */
class NativeCustomerBookController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
    private val requestMyLocation: () -> Unit,
) {
    private enum class Step { ROUTE, CARGO, TRUCK, QUOTE, REVIEW, SUCCESS }
    private data class Option(val key: String, val englishLabel: String, val labelRes: Int)
    private data class Truck(val value: String, val capacity: Int, val imageRes: Int, val label: String)

    private val stepHost = root.findViewById<FrameLayout>(R.id.nativeBookStepHost)
    private val stepViews = listOf(
        root.findViewById<TextView>(R.id.nativeBookStepRoute),
        root.findViewById<TextView>(R.id.nativeBookStepCargo),
        root.findViewById<TextView>(R.id.nativeBookStepTruck),
        root.findViewById<TextView>(R.id.nativeBookStepQuote),
        root.findViewById<TextView>(R.id.nativeBookStepReview),
    )

    private var step = Step.ROUTE
    private var latestState = viewModel.state.value
    private var suppressTextCallbacks = false
    private var pickupQuery = latestState.selectedPickup?.label.orEmpty()
    private var dropoffQuery = latestState.selectedDropoff?.label.orEmpty()
    private var quantityText = ""
    private var notesText = ""
    private var selectedVehicle = vehicleOptions.first { it.value == "Dry Cargo" }
    private var selectedCategory = categories.first { it.key == "general_goods" }
    private var selectedPackaging = packagingTypes.first { it.key == "loose_bulk" }
    private var selectedUnit = units.first { it.key == "ton" }
    private var selectedPayment = paymentMethods.first { it.key == "cash" }
    private var pickupSuggestions: List<CustomerPlace> = emptyList()
    private var dropoffSuggestions: List<CustomerPlace> = emptyList()
    private var calculationRequested = false
    private var orderSubmitting = false
    private var successTrackingId: String? = null

    init {
        updateStepLabels()
        showStep(Step.ROUTE)
    }

    fun render(state: CustomerUiState) {
        latestState = state
        pickupSuggestions = state.pickupSuggestions
        dropoffSuggestions = state.dropoffSuggestions

        if (orderSubmitting && state.message.startsWith("Order ") && state.message.endsWith(" created")) {
            successTrackingId = state.message.removePrefix("Order ").removeSuffix(" created")
            orderSubmitting = false
            showStep(Step.SUCCESS)
            return
        }
        renderCurrentStep()
    }

    fun setCurrentPickup(place: CustomerPlace) {
        pickupQuery = place.label
        viewModel.selectPlace(place, pickup = true)
        if (step == Step.ROUTE) renderCurrentStep()
    }

    private fun updateStepLabels() {
        val labels = listOf(R.string.flow_route, R.string.flow_cargo, R.string.flow_truck, R.string.flow_quote, R.string.flow_review)
        stepViews.forEachIndexed { index, view ->
            view.text = "${index + 1}\n${activity.getString(labels[index])}"
        }
    }

    private fun showStep(next: Step) {
        step = next
        val layout = when (next) {
            Step.ROUTE -> R.layout.step_customer_book_route
            Step.CARGO -> R.layout.step_customer_book_cargo
            Step.TRUCK -> R.layout.step_customer_book_truck
            Step.QUOTE -> R.layout.step_customer_book_quote
            Step.REVIEW -> R.layout.step_customer_book_review
            Step.SUCCESS -> R.layout.step_customer_book_success
        }
        stepHost.removeAllViews()
        val page = activity.layoutInflater.inflate(layout, stepHost, false)
        stepHost.addView(page)
        bindCurrentStep(page)
        updateStepIndicator()
        renderCurrentStep()
    }

    private fun updateStepIndicator() {
        val activeIndex = when (step) {
            Step.ROUTE -> 0
            Step.CARGO -> 1
            Step.TRUCK -> 2
            Step.QUOTE -> 3
            Step.REVIEW, Step.SUCCESS -> 4
        }
        stepViews.forEachIndexed { index, view ->
            val active = index == activeIndex
            view.setTextColor(activity.getColor(if (active) R.color.auth_blue else R.color.hallo_muted))
            view.textSize = if (active) 11f else 9f
        }
        root.findViewById<TextView>(R.id.nativeBookFlowTitle).text = if (step == Step.SUCCESS) {
            activity.getString(R.string.flow_success_title)
        } else {
            activity.getString(R.string.book_truck)
        }
    }

    private fun bindCurrentStep(page: View) {
        when (step) {
            Step.ROUTE -> bindRoute(page)
            Step.CARGO -> bindCargo(page)
            Step.TRUCK -> bindTruck(page)
            Step.QUOTE -> bindQuote(page)
            Step.REVIEW -> bindReview(page)
            Step.SUCCESS -> bindSuccess(page)
        }
    }

    private fun renderCurrentStep() {
        when (step) {
            Step.ROUTE -> renderRoute()
            Step.CARGO -> renderCargo()
            Step.TRUCK -> renderTruck()
            Step.QUOTE -> renderQuote()
            Step.REVIEW -> renderReview()
            Step.SUCCESS -> renderSuccess()
        }
    }

    private fun bindRoute(page: View) {
        val pickup = page.findViewById<AutoCompleteTextView>(R.id.flowPickup)
        val dropoff = page.findViewById<AutoCompleteTextView>(R.id.flowDropoff)
        replaceText(pickup, latestState.selectedPickup?.label ?: pickupQuery)
        replaceText(dropoff, latestState.selectedDropoff?.label ?: dropoffQuery)

        pickup.doAfterTextChanged { value ->
            if (!suppressTextCallbacks) {
                pickupQuery = value?.toString().orEmpty()
                calculationRequested = false
                viewModel.placeInputChanged(pickupQuery, pickup = true)
            }
        }
        dropoff.doAfterTextChanged { value ->
            if (!suppressTextCallbacks) {
                dropoffQuery = value?.toString().orEmpty()
                calculationRequested = false
                viewModel.placeInputChanged(dropoffQuery, pickup = false)
            }
        }
        pickup.setOnItemClickListener { _, _, position, _ ->
            pickupSuggestions.getOrNull(position)?.let {
                pickupQuery = it.label
                viewModel.selectPlace(it, pickup = true)
            }
        }
        dropoff.setOnItemClickListener { _, _, position, _ ->
            dropoffSuggestions.getOrNull(position)?.let {
                dropoffQuery = it.label
                viewModel.selectPlace(it, pickup = false)
            }
        }
        page.findViewById<MaterialButton>(R.id.flowUseLocation).setOnClickListener { requestMyLocation() }
        page.findViewById<MaterialButton>(R.id.flowSwapRoute).setOnClickListener {
            val oldPickup = pickupQuery
            pickupQuery = dropoffQuery
            dropoffQuery = oldPickup
            viewModel.swapRoute()
            showStep(Step.ROUTE)
        }
        page.findViewById<MaterialButton>(R.id.flowRouteNext).setOnClickListener {
            if (latestState.selectedPickup == null || latestState.selectedDropoff == null) {
                page.findViewById<TextView>(R.id.flowRouteHint).apply {
                    text = activity.getString(R.string.flow_route_required)
                    setTextColor(activity.getColor(R.color.hallo_danger))
                }
                return@setOnClickListener
            }
            showStep(Step.CARGO)
        }
    }

    private fun renderRoute() {
        val page = stepHost.getChildAt(0) ?: return
        val pickup = page.findViewById<AutoCompleteTextView>(R.id.flowPickup)
        val dropoff = page.findViewById<AutoCompleteTextView>(R.id.flowDropoff)
        updateSuggestionAdapter(pickup, pickupSuggestions)
        updateSuggestionAdapter(dropoff, dropoffSuggestions)
        latestState.selectedPickup?.let {
            pickupQuery = it.label
            if (pickup.text.toString() != it.label) replaceText(pickup, it.label)
        }
        latestState.selectedDropoff?.let {
            dropoffQuery = it.label
            if (dropoff.text.toString() != it.label) replaceText(dropoff, it.label)
        }
        page.findViewById<TextInputLayout>(R.id.flowPickupLayout).error = latestState.placeSearchMessage.takeIf { pickup.hasFocus() }
        page.findViewById<TextInputLayout>(R.id.flowDropoffLayout).error = latestState.placeSearchMessage.takeIf { dropoff.hasFocus() }
        page.findViewById<CustomerLiveMapView>(R.id.flowRouteMap).showBooking(latestState.selectedPickup, latestState.selectedDropoff, latestState.route)
        page.findViewById<MaterialButton>(R.id.flowRouteNext).isEnabled = !latestState.busy
    }

    private fun bindCargo(page: View) {
        val category = page.findViewById<HalloDropdownView>(R.id.flowCargoCategory)
        val unit = page.findViewById<HalloDropdownView>(R.id.flowCargoUnit)
        val packaging = page.findViewById<HalloDropdownView>(R.id.flowCargoPackaging)
        val quantity = page.findViewById<EditText>(R.id.flowCargoQuantity)
        val notes = page.findViewById<EditText>(R.id.flowCargoNotes)
        bindOptions(category, categories, selectedCategory) { selectedCategory = it }
        bindOptions(unit, units, selectedUnit) {
            selectedUnit = it
            calculationRequested = false
            viewModel.bookingInputChanged()
            renderCargo()
        }
        bindOptions(packaging, packagingTypes, selectedPackaging) { selectedPackaging = it }
        quantity.setText(quantityText)
        notes.setText(notesText)
        quantity.doAfterTextChanged {
            quantityText = it?.toString().orEmpty()
            calculationRequested = false
            viewModel.bookingInputChanged()
            renderCargoSummary(page)
        }
        notes.doAfterTextChanged { notesText = it?.toString().orEmpty() }
        page.findViewById<MaterialButton>(R.id.flowCargoBack).setOnClickListener { showStep(Step.ROUTE) }
        page.findViewById<MaterialButton>(R.id.flowCargoNext).setOnClickListener {
            val error = validateCargo()
            if (error != null) {
                page.findViewById<TextView>(R.id.flowCargoSummary).apply {
                    text = error
                    setTextColor(activity.getColor(R.color.hallo_danger))
                }
            } else {
                showStep(Step.TRUCK)
            }
        }
    }

    private fun renderCargo() {
        val page = stepHost.getChildAt(0) ?: return
        renderCargoSummary(page)
    }

    private fun renderCargoSummary(page: View) {
        val summary = page.findViewById<TextView>(R.id.flowCargoSummary)
        val tons = cargoTons()
        summary.text = if (tons > 0) {
            activity.getString(
                R.string.flow_cargo_summary,
                activity.getString(selectedCategory.labelRes),
                formatTons(tons),
                activity.getString(selectedPackaging.labelRes),
            )
        } else {
            activity.getString(R.string.enter_valid_load)
        }
        summary.setTextColor(activity.getColor(if (tons > 0) R.color.hallo_muted else R.color.hallo_danger))
    }

    private fun bindTruck(page: View) {
        page.findViewById<MaterialButton>(R.id.flowTruckBack).setOnClickListener { showStep(Step.CARGO) }
        page.findViewById<MaterialButton>(R.id.flowTruckNext).setOnClickListener {
            val error = validateDraft()
            if (error != null) {
                page.findViewById<TextView>(R.id.flowTruckError).apply {
                    text = error
                    visibility = View.VISIBLE
                }
                return@setOnClickListener
            }
            calculationRequested = true
            showStep(Step.QUOTE)
            calculateQuote()
        }
        renderTruckOptions(page)
    }

    private fun renderTruck() {
        val page = stepHost.getChildAt(0) ?: return
        page.findViewById<MaterialButton>(R.id.flowTruckNext).isEnabled = !latestState.busy
    }

    private fun renderTruckOptions(page: View) {
        val container = page.findViewById<LinearLayout>(R.id.flowTruckOptions)
        container.removeAllViews()
        vehicleOptions.forEach { truck ->
            val item = ItemCustomerTruckBinding.inflate(activity.layoutInflater, container, false)
            item.root.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(10)
            }
            item.truckImage.setImageResource(truck.imageRes)
            item.truckImage.contentDescription = truck.label
            item.truckName.text = truck.label
            item.truckCapacity.text = activity.getString(R.string.up_to_tons, truck.capacity)
            val selected = truck.value == selectedVehicle.value
            item.root.strokeWidth = if (selected) dp(3) else dp(1)
            item.root.setStrokeColor(activity.getColor(if (selected) R.color.auth_blue else R.color.hallo_line))
            item.root.setCardBackgroundColor(activity.getColor(if (selected) R.color.hallo_navy_soft else android.R.color.white))
            item.root.setOnClickListener {
                if (selectedVehicle.value != truck.value) {
                    selectedVehicle = truck
                    calculationRequested = false
                    viewModel.bookingInputChanged()
                    renderTruckOptions(page)
                    page.findViewById<TextView>(R.id.flowTruckError).visibility = View.GONE
                }
            }
            container.addView(item.root)
        }
    }

    private fun bindQuote(page: View) {
        page.findViewById<MaterialButton>(R.id.flowQuoteBack).setOnClickListener {
            calculationRequested = false
            showStep(Step.TRUCK)
        }
        page.findViewById<MaterialButton>(R.id.flowQuoteRetry).setOnClickListener {
            calculationRequested = true
            calculateQuote()
        }
        page.findViewById<MaterialButton>(R.id.flowQuoteNext).setOnClickListener {
            if (latestState.route != null && latestState.quote != null) showStep(Step.REVIEW)
        }
    }

    private fun calculateQuote() {
        viewModel.calculateAutomaticRoute(
            pickupQuery,
            dropoffQuery,
            selectedVehicle.value,
            cargoTons(),
        )
    }

    private fun renderQuote() {
        val page = stepHost.getChildAt(0) ?: return
        val route = latestState.route
        val quote = latestState.quote
        page.findViewById<CustomerLiveMapView>(R.id.flowQuoteMap).showBooking(latestState.selectedPickup, latestState.selectedDropoff, route)
        page.findViewById<ProgressBar>(R.id.flowQuoteProgress).visibility = if (latestState.busy) View.VISIBLE else View.GONE
        page.findViewById<TextView>(R.id.flowQuoteRoute).text = route?.let {
            activity.getString(R.string.flow_route_line, it.pickup.label, it.dropoff.label)
        } ?: activity.getString(R.string.route_calculating)
        page.findViewById<TextView>(R.id.flowQuoteDetails).text = route?.let {
            activity.getString(
                R.string.flow_quote_details,
                formatDistance(it.distanceKm),
                activity.getString(R.string.minutes_short, it.durationMinutes),
                selectedVehicle.label,
                formatTons(cargoTons()),
            )
        }.orEmpty()
        page.findViewById<TextView>(R.id.flowQuoteTotal).text = quote?.let {
            activity.getString(R.string.flow_total_etb, number(it.totalEtb))
        }.orEmpty()
        val failed = calculationRequested && !latestState.busy && quote == null
        page.findViewById<TextView>(R.id.flowQuoteError).apply {
            visibility = if (failed) View.VISIBLE else View.GONE
            text = latestState.message
        }
        page.findViewById<MaterialButton>(R.id.flowQuoteRetry).visibility = if (failed) View.VISIBLE else View.GONE
        page.findViewById<MaterialButton>(R.id.flowQuoteNext).isEnabled = quote != null && route != null && !latestState.busy
        if (quote != null) calculationRequested = false
    }

    private fun bindReview(page: View) {
        val payment = page.findViewById<HalloDropdownView>(R.id.flowReviewPayment)
        bindOptions(payment, paymentMethods, selectedPayment) { selectedPayment = it }
        page.findViewById<MaterialButton>(R.id.flowReviewBack).setOnClickListener { showStep(Step.QUOTE) }
        page.findViewById<MaterialButton>(R.id.flowReviewConfirm).setOnClickListener { confirmOrder(page) }
    }

    private fun renderReview() {
        val page = stepHost.getChildAt(0) ?: return
        val route = latestState.route ?: return
        val quote = latestState.quote ?: return
        page.findViewById<TextView>(R.id.flowReviewRoute).text = activity.getString(R.string.flow_route_line, route.pickup.label, route.dropoff.label)
        page.findViewById<TextView>(R.id.flowReviewCargo).text = activity.getString(
            R.string.flow_cargo_summary,
            activity.getString(selectedCategory.labelRes),
            formatTons(cargoTons()),
            activity.getString(selectedPackaging.labelRes),
        )
        page.findViewById<TextView>(R.id.flowReviewTruck).text = "${activity.getString(R.string.truck)}: ${selectedVehicle.label}\n${activity.getString(R.string.distance)}: ${formatDistance(route.distanceKm)}"
        page.findViewById<TextView>(R.id.flowReviewTotal).text = activity.getString(R.string.flow_total_etb, number(quote.totalEtb))
        page.findViewById<MaterialButton>(R.id.flowReviewConfirm).isEnabled = !latestState.busy
        page.findViewById<TextView>(R.id.flowReviewError).apply {
            visibility = if (orderSubmitting && !latestState.busy && !latestState.message.startsWith("Order ")) View.VISIBLE else View.GONE
            text = latestState.message
        }
    }

    private fun confirmOrder(page: View) {
        val route = latestState.route ?: return
        val quote = latestState.quote ?: return
        val validation = validateDraft()
        if (validation != null) {
            page.findViewById<TextView>(R.id.flowReviewError).apply {
                text = validation
                visibility = View.VISIBLE
            }
            return
        }
        val amount = quantityText.trim().toDoubleOrNull() ?: return
        val description = CustomerBookingPolicy.cargoDescription(
            selectedCategory.englishLabel,
            selectedPackaging.englishLabel,
            amount,
            selectedUnit.key,
            notesText,
        )
        orderSubmitting = true
        viewModel.createOrder(
            CreateOrderInput(
                pickupAddress = route.pickup.label,
                pickupLongitude = route.pickup.longitude,
                pickupLatitude = route.pickup.latitude,
                dropoffAddress = route.dropoff.label,
                dropoffLongitude = route.dropoff.longitude,
                dropoffLatitude = route.dropoff.latitude,
                vehicleType = selectedVehicle.value,
                distanceKm = route.distanceKm,
                cargoTons = quote.cargoTons,
                cargoQuantity = amount,
                cargoUnit = selectedUnit.key,
                cargoCategory = selectedCategory.key,
                packagingType = selectedPackaging.key,
                cargoDescription = description,
                paymentMethod = selectedPayment.key,
                quoteEtb = quote.totalEtb,
            ),
        )
    }

    private fun bindSuccess(page: View) {
        page.findViewById<MaterialButton>(R.id.flowSuccessViewOrder).setOnClickListener { viewModel.show(CustomerPage.ORDERS) }
        page.findViewById<MaterialButton>(R.id.flowSuccessAnother).setOnClickListener { startAnotherBooking() }
    }

    private fun renderSuccess() {
        val page = stepHost.getChildAt(0) ?: return
        val route = latestState.route
        val quote = latestState.quote
        page.findViewById<TextView>(R.id.flowSuccessOrder).text = activity.getString(R.string.flow_order_number, successTrackingId ?: "—")
        page.findViewById<TextView>(R.id.flowSuccessRoute).text = route?.let { activity.getString(R.string.flow_route_line, it.pickup.label, it.dropoff.label) }.orEmpty()
        page.findViewById<TextView>(R.id.flowSuccessTruck).text = "${activity.getString(R.string.truck)}: ${selectedVehicle.label}"
        page.findViewById<TextView>(R.id.flowSuccessTotal).text = quote?.let { activity.getString(R.string.flow_total_etb, number(it.totalEtb)) }.orEmpty()
    }

    private fun startAnotherBooking() {
        pickupQuery = ""
        dropoffQuery = ""
        quantityText = ""
        notesText = ""
        selectedVehicle = vehicleOptions.first { it.value == "Dry Cargo" }
        selectedCategory = categories.first { it.key == "general_goods" }
        selectedPackaging = packagingTypes.first { it.key == "loose_bulk" }
        selectedUnit = units.first { it.key == "ton" }
        selectedPayment = paymentMethods.first { it.key == "cash" }
        successTrackingId = null
        calculationRequested = false
        orderSubmitting = false
        viewModel.resetRoute()
        showStep(Step.ROUTE)
    }

    private fun validateCargo(): String? {
        val amount = quantityText.trim().toDoubleOrNull() ?: 0.0
        val tons = CustomerBookingPolicy.cargoToTons(amount, selectedUnit.key)
        if (tons <= 0) return activity.getString(R.string.enter_valid_load)
        if (selectedCategory.key == "other" && notesText.trim().length < 3) return activity.getString(R.string.native_cargo_other_required)
        return null
    }

    private fun validateDraft(): String? {
        validateCargo()?.let { return it }
        val tons = cargoTons()
        val capacity = CustomerBookingPolicy.truckCapacityTons(selectedVehicle.value)
        if (capacity != null && tons > capacity) {
            return activity.getString(R.string.capacity_exceeded, formatTons(tons), formatTons(capacity))
        }
        if (selectedPackaging.key in setOf("container_20ft", "container_40ft") && selectedVehicle.value != "Trailer") {
            return activity.getString(R.string.native_container_requires_trailer)
        }
        return null
    }

    private fun bindOptions(
        view: HalloDropdownView,
        values: List<Option>,
        selected: Option,
        onSelected: (Option) -> Unit,
    ) {
        fun label(option: Option) = activity.getString(option.labelRes)
        view.setAdapter(ArrayAdapter(activity, android.R.layout.simple_dropdown_item_1line, values.map(::label)))
        view.setText(label(selected), false)
        view.setOnItemClickListener { _, _, position, _ ->
            values.getOrNull(position)?.let { option ->
                view.setText(label(option), false)
                onSelected(option)
            }
        }
    }

    private fun updateSuggestionAdapter(view: AutoCompleteTextView, places: List<CustomerPlace>) {
        view.setAdapter(ArrayAdapter(activity, android.R.layout.simple_dropdown_item_1line, places.map { it.label }))
        if (view.hasFocus() && places.isNotEmpty()) view.post { view.showDropDown() }
    }

    private fun replaceText(view: AutoCompleteTextView, value: String) {
        suppressTextCallbacks = true
        view.setText(value, false)
        view.setSelection(value.length)
        suppressTextCallbacks = false
    }

    private fun cargoTons(): Double = CustomerBookingPolicy.cargoToTons(
        quantityText.trim().toDoubleOrNull() ?: 0.0,
        selectedUnit.key,
    )

    private fun formatTons(value: Double): String = activity.getString(R.string.tons_short, number(value))
    private fun formatDistance(value: Double): String = activity.getString(
        R.string.distance_km,
        NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 1 }.format(value),
    )
    private fun number(value: Double): String = NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 2 }.format(value)
    private fun dp(value: Int): Int = (value * activity.resources.displayMetrics.density).toInt()

    private companion object {
        val vehicleOptions = listOf(
            Truck("Pickup", 3, R.drawable.truck_isuzu_5, "Pickup"),
            Truck("Van", 5, R.drawable.truck_isuzu_5, "Van"),
            Truck("Isuzu 5 Ton", 5, R.drawable.truck_isuzu_5, "Isuzu 5 Ton"),
            Truck("Dry Cargo", 10, R.drawable.truck_10_ton, "Dry Cargo"),
            Truck("Refrigerated", 15, R.drawable.truck_10_ton, "Refrigerated"),
            Truck("Truck 22 Ton", 22, R.drawable.truck_22_ton, "Truck 22 Ton"),
            Truck("Truck 25 Ton", 25, R.drawable.truck_25_ton, "Truck 25 Ton"),
            Truck("Truck 30 Ton", 30, R.drawable.truck_30_ton, "Truck 30 Ton"),
            Truck("Trailer", 45, R.drawable.truck_30_ton, "Trailer"),
        )
        val categories = listOf(
            Option("food", "Food", R.string.category_food),
            Option("grain_rice", "Grain / rice", R.string.category_grain_rice),
            Option("cooking_oil", "Cooking oil", R.string.category_cooking_oil),
            Option("metal_steel", "Metal / steel", R.string.category_metal_steel),
            Option("construction_materials", "Construction materials", R.string.category_construction),
            Option("general_goods", "General goods", R.string.category_general_goods),
            Option("other", "Other", R.string.option_other),
        )
        val packagingTypes = listOf(
            Option("bagged", "Bagged", R.string.packaging_bagged),
            Option("drum_tank", "Drum / tank", R.string.packaging_drum_tank),
            Option("pallet", "Pallet", R.string.packaging_pallet),
            Option("loose_bulk", "Loose / bulk", R.string.packaging_loose_bulk),
            Option("container_20ft", "20 ft container", R.string.packaging_20ft),
            Option("container_40ft", "40 ft container", R.string.packaging_40ft),
            Option("other", "Other", R.string.option_other),
        )
        val units = listOf(
            Option("ton", "Ton", R.string.unit_ton),
            Option("quintal", "Quintal", R.string.unit_quintal),
        )
        val paymentMethods = listOf(
            Option("cash", "Cash on delivery", R.string.cash_on_delivery),
            Option("bank_telebirr", "Bank / Telebirr", R.string.bank_telebirr),
        )
    }
}
