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

/** PDF2 booking journey. Backend/routing/pricing contracts remain unchanged. */
class NativeCustomerBookController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
    private val requestMyLocation: () -> Unit,
) {
    private enum class Step { ROUTE, CARGO, TRUCK, QUOTE, REVIEW, SUCCESS }
    private data class Option(val key: String, val englishLabel: String, val labelRes: Int)
    private data class Truck(val value: String, val capacity: Int, val imageRes: Int, val label: String)

    private val host = root.findViewById<FrameLayout>(R.id.nativeBookStepHost)
    private val indicators = listOf(
        root.findViewById<TextView>(R.id.nativeBookStepRoute), root.findViewById(R.id.nativeBookStepCargo),
        root.findViewById(R.id.nativeBookStepTruck), root.findViewById(R.id.nativeBookStepQuote),
        root.findViewById(R.id.nativeBookStepReview),
    )
    private var step = Step.ROUTE
    private var state = viewModel.state.value
    private var suppressText = false
    private var pickupQuery = state.selectedPickup?.label.orEmpty()
    private var dropoffQuery = state.selectedDropoff?.label.orEmpty()
    private var quantityText = ""
    private var notesText = ""
    private var vehicle = vehicleOptions.first { it.value == "Dry Cargo" }
    private var category = categories.first { it.key == "general_goods" }
    private var packaging = packagingTypes.first { it.key == "loose_bulk" }
    private var unit = units.first { it.key == "ton" }
    private var payment = paymentMethods.first { it.key == "cash" }
    private var pickupSuggestions = emptyList<CustomerPlace>()
    private var dropoffSuggestions = emptyList<CustomerPlace>()
    private var calculationRequested = false
    private var orderSubmitting = false
    private var trackingId: String? = null

    init { setIndicatorLabels(); show(Step.ROUTE) }

    fun render(next: CustomerUiState) {
        state = next
        pickupSuggestions = next.pickupSuggestions
        dropoffSuggestions = next.dropoffSuggestions
        if (orderSubmitting && next.message.startsWith("Booking ") && next.message.endsWith(" created")) {
            trackingId = next.message.removePrefix("Booking ").removeSuffix(" created")
            orderSubmitting = false
            show(Step.SUCCESS)
            return
        }
        renderStep()
    }

    fun setCurrentPickup(place: CustomerPlace) {
        pickupQuery = place.label
        viewModel.selectPlace(place, true)
        if (step == Step.ROUTE) renderStep()
    }

    private fun setIndicatorLabels() {
        val labels = listOf(R.string.flow_route, R.string.flow_cargo, R.string.flow_truck, R.string.flow_quote, R.string.flow_review)
        indicators.forEachIndexed { index, view -> view.text = "${index + 1}\n${activity.getString(labels[index])}" }
    }

    private fun show(next: Step) {
        step = next
        val layout = when (next) {
            Step.ROUTE -> R.layout.step_customer_book_route
            Step.CARGO -> R.layout.step_customer_book_cargo
            Step.TRUCK -> R.layout.step_customer_book_truck
            Step.QUOTE -> R.layout.step_customer_book_quote
            Step.REVIEW -> R.layout.step_customer_book_review
            Step.SUCCESS -> R.layout.step_customer_book_success
        }
        host.removeAllViews()
        val page = activity.layoutInflater.inflate(layout, host, false)
        host.addView(page)
        bind(page)
        updateIndicator()
        renderStep()
    }

    private fun updateIndicator() {
        val active = when (step) { Step.ROUTE -> 0; Step.CARGO -> 1; Step.TRUCK -> 2; Step.QUOTE -> 3; Step.REVIEW, Step.SUCCESS -> 4 }
        indicators.forEachIndexed { i, view ->
            view.setTextColor(activity.getColor(if (i == active) R.color.auth_blue else R.color.hallo_muted))
            view.textSize = if (i == active) 11f else 9f
        }
        root.findViewById<TextView>(R.id.nativeBookFlowTitle).text = activity.getString(if (step == Step.SUCCESS) R.string.flow_success_title else R.string.book_truck)
    }

    private fun bind(page: View) = when (step) {
        Step.ROUTE -> bindRoute(page); Step.CARGO -> bindCargo(page); Step.TRUCK -> bindTruck(page)
        Step.QUOTE -> bindQuote(page); Step.REVIEW -> bindReview(page); Step.SUCCESS -> bindSuccess(page)
    }

    private fun renderStep() = when (step) {
        Step.ROUTE -> renderRoute(); Step.CARGO -> renderCargo(); Step.TRUCK -> renderTruck()
        Step.QUOTE -> renderQuote(); Step.REVIEW -> renderReview(); Step.SUCCESS -> renderSuccess()
    }

    private fun bindRoute(page: View) {
        val pickup = page.findViewById<AutoCompleteTextView>(R.id.flowPickup)
        val dropoff = page.findViewById<AutoCompleteTextView>(R.id.flowDropoff)
        replace(pickup, state.selectedPickup?.label ?: pickupQuery); replace(dropoff, state.selectedDropoff?.label ?: dropoffQuery)
        pickup.doAfterTextChanged { if (!suppressText) { pickupQuery = it?.toString().orEmpty(); calculationRequested = false; viewModel.placeInputChanged(pickupQuery, true) } }
        dropoff.doAfterTextChanged { if (!suppressText) { dropoffQuery = it?.toString().orEmpty(); calculationRequested = false; viewModel.placeInputChanged(dropoffQuery, false) } }
        pickup.setOnItemClickListener { _, _, p, _ -> pickupSuggestions.getOrNull(p)?.let { pickupQuery = it.label; viewModel.selectPlace(it, true) } }
        dropoff.setOnItemClickListener { _, _, p, _ -> dropoffSuggestions.getOrNull(p)?.let { dropoffQuery = it.label; viewModel.selectPlace(it, false) } }
        page.findViewById<MaterialButton>(R.id.flowUseLocation).setOnClickListener { requestMyLocation() }
        page.findViewById<MaterialButton>(R.id.flowSwapRoute).setOnClickListener {
            val old = pickupQuery; pickupQuery = dropoffQuery; dropoffQuery = old; viewModel.swapRoute(); show(Step.ROUTE)
        }
        page.findViewById<MaterialButton>(R.id.flowRouteNext).setOnClickListener {
            if (state.selectedPickup == null || state.selectedDropoff == null) {
                page.findViewById<TextView>(R.id.flowRouteHint).apply { text = activity.getString(R.string.flow_route_required); setTextColor(activity.getColor(R.color.hallo_danger)) }
            } else show(Step.CARGO)
        }
    }

    private fun renderRoute() {
        val page = host.getChildAt(0) ?: return
        val pickup = page.findViewById<AutoCompleteTextView>(R.id.flowPickup); val dropoff = page.findViewById<AutoCompleteTextView>(R.id.flowDropoff)
        suggestionAdapter(pickup, pickupSuggestions); suggestionAdapter(dropoff, dropoffSuggestions)
        state.selectedPickup?.let { pickupQuery = it.label; if (pickup.text.toString() != it.label) replace(pickup, it.label) }
        state.selectedDropoff?.let { dropoffQuery = it.label; if (dropoff.text.toString() != it.label) replace(dropoff, it.label) }
        page.findViewById<TextInputLayout>(R.id.flowPickupLayout).error = state.placeSearchMessage.takeIf { pickup.hasFocus() }
        page.findViewById<TextInputLayout>(R.id.flowDropoffLayout).error = state.placeSearchMessage.takeIf { dropoff.hasFocus() }
        page.findViewById<CustomerLiveMapView>(R.id.flowRouteMap).showBooking(state.selectedPickup, state.selectedDropoff, state.route)
    }

    private fun bindCargo(page: View) {
        val cat = page.findViewById<HalloDropdownView>(R.id.flowCargoCategory); val pack = page.findViewById<HalloDropdownView>(R.id.flowCargoPackaging)
        val units = page.findViewById<HalloDropdownView>(R.id.flowCargoUnit); val qty = page.findViewById<EditText>(R.id.flowCargoQuantity); val notes = page.findViewById<EditText>(R.id.flowCargoNotes)
        optionAdapter(cat, categories, category) { category = it }; optionAdapter(pack, packagingTypes, packaging) { packaging = it }
        optionAdapter(units, Companion.units, unit) { unit = it; calculationRequested = false; viewModel.bookingInputChanged(); renderCargo() }
        qty.setText(quantityText); notes.setText(notesText)
        qty.doAfterTextChanged { quantityText = it?.toString().orEmpty(); calculationRequested = false; viewModel.bookingInputChanged(); cargoSummary(page) }
        notes.doAfterTextChanged { notesText = it?.toString().orEmpty() }
        page.findViewById<MaterialButton>(R.id.flowCargoBack).setOnClickListener { show(Step.ROUTE) }
        page.findViewById<MaterialButton>(R.id.flowCargoNext).setOnClickListener {
            val error = validateCargo(); if (error == null) show(Step.TRUCK) else page.findViewById<TextView>(R.id.flowCargoSummary).apply { text = error; setTextColor(activity.getColor(R.color.hallo_danger)) }
        }
    }

    private fun renderCargo() { host.getChildAt(0)?.let(::cargoSummary) }
    private fun cargoSummary(page: View) {
        val tons = cargoTons(); page.findViewById<TextView>(R.id.flowCargoSummary).apply {
            text = if (tons > 0) activity.getString(R.string.flow_cargo_summary, activity.getString(category.labelRes), formatTons(tons), activity.getString(packaging.labelRes)) else activity.getString(R.string.enter_valid_load)
            setTextColor(activity.getColor(if (tons > 0) R.color.hallo_muted else R.color.hallo_danger))
        }
    }

    private fun bindTruck(page: View) {
        page.findViewById<MaterialButton>(R.id.flowTruckBack).setOnClickListener { show(Step.CARGO) }
        page.findViewById<MaterialButton>(R.id.flowTruckNext).setOnClickListener {
            val error = validateDraft()
            if (error != null) page.findViewById<TextView>(R.id.flowTruckError).apply { text = error; visibility = View.VISIBLE }
            else { calculationRequested = true; show(Step.QUOTE); calculate() }
        }
        renderTruckOptions(page)
    }
    private fun renderTruck() { host.getChildAt(0)?.findViewById<MaterialButton>(R.id.flowTruckNext)?.isEnabled = !state.busy }
    private fun renderTruckOptions(page: View) {
        val box = page.findViewById<LinearLayout>(R.id.flowTruckOptions); box.removeAllViews()
        vehicleOptions.forEach { truck ->
            val item = ItemCustomerTruckBinding.inflate(activity.layoutInflater, box, false)
            item.root.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(10) }
            item.truckImage.setImageResource(truck.imageRes); item.truckName.text = truck.label; item.truckCapacity.text = activity.getString(R.string.up_to_tons, truck.capacity)
            val selected = truck.value == vehicle.value
            item.root.strokeWidth = if (selected) dp(3) else dp(1); item.root.setStrokeColor(activity.getColor(if (selected) R.color.auth_blue else R.color.hallo_line)); item.root.setCardBackgroundColor(activity.getColor(if (selected) R.color.hallo_navy_soft else android.R.color.white))
            item.root.setOnClickListener { if (vehicle.value != truck.value) { vehicle = truck; calculationRequested = false; viewModel.bookingInputChanged(); renderTruckOptions(page); page.findViewById<TextView>(R.id.flowTruckError).visibility = View.GONE } }
            box.addView(item.root)
        }
    }

    private fun bindQuote(page: View) {
        page.findViewById<MaterialButton>(R.id.flowQuoteBack).setOnClickListener { calculationRequested = false; show(Step.TRUCK) }
        page.findViewById<MaterialButton>(R.id.flowQuoteRetry).setOnClickListener { calculationRequested = true; calculate() }
        page.findViewById<MaterialButton>(R.id.flowQuoteNext).setOnClickListener { if (state.route != null && state.quote != null) show(Step.REVIEW) }
    }
    private fun calculate() = viewModel.calculateAutomaticRoute(pickupQuery, dropoffQuery, vehicle.value, cargoTons())
    private fun renderQuote() {
        val page = host.getChildAt(0) ?: return; val route = state.route; val quote = state.quote
        page.findViewById<CustomerLiveMapView>(R.id.flowQuoteMap).showBooking(state.selectedPickup, state.selectedDropoff, route)
        page.findViewById<ProgressBar>(R.id.flowQuoteProgress).visibility = if (state.busy) View.VISIBLE else View.GONE
        page.findViewById<TextView>(R.id.flowQuoteRoute).text = route?.let { activity.getString(R.string.flow_route_line, it.pickup.label, it.dropoff.label) } ?: activity.getString(R.string.route_calculating)
        page.findViewById<TextView>(R.id.flowQuoteDetails).text = route?.let { activity.getString(R.string.flow_quote_details, formatDistance(it.distanceKm), activity.getString(R.string.minutes_short, it.durationMinutes), vehicle.label, formatTons(cargoTons())) }.orEmpty()
        page.findViewById<TextView>(R.id.flowQuoteTotal).text = quote?.let { activity.getString(R.string.flow_total_etb, number(it.totalEtb)) }.orEmpty()
        val failed = calculationRequested && !state.busy && quote == null
        page.findViewById<TextView>(R.id.flowQuoteError).apply { visibility = if (failed) View.VISIBLE else View.GONE; text = state.message }
        page.findViewById<MaterialButton>(R.id.flowQuoteRetry).visibility = if (failed) View.VISIBLE else View.GONE
        page.findViewById<MaterialButton>(R.id.flowQuoteNext).isEnabled = quote != null && route != null && !state.busy
        if (quote != null) calculationRequested = false
    }

    private fun bindReview(page: View) {
        optionAdapter(page.findViewById(R.id.flowReviewPayment), paymentMethods, payment) { payment = it }
        page.findViewById<MaterialButton>(R.id.flowReviewBack).setOnClickListener { show(Step.QUOTE) }
        page.findViewById<MaterialButton>(R.id.flowReviewConfirm).setOnClickListener { confirm(page) }
    }
    private fun renderReview() {
        val page = host.getChildAt(0) ?: return; val route = state.route ?: return; val quote = state.quote ?: return
        page.findViewById<TextView>(R.id.flowReviewRoute).text = activity.getString(R.string.flow_route_line, route.pickup.label, route.dropoff.label)
        page.findViewById<TextView>(R.id.flowReviewCargo).text = activity.getString(R.string.flow_cargo_summary, activity.getString(category.labelRes), formatTons(cargoTons()), activity.getString(packaging.labelRes))
        page.findViewById<TextView>(R.id.flowReviewTruck).text = "${activity.getString(R.string.truck)}: ${vehicle.label}\n${activity.getString(R.string.distance)}: ${formatDistance(route.distanceKm)}"
        page.findViewById<TextView>(R.id.flowReviewTotal).text = activity.getString(R.string.flow_total_etb, number(quote.totalEtb))
        page.findViewById<MaterialButton>(R.id.flowReviewConfirm).isEnabled = !state.busy
        page.findViewById<TextView>(R.id.flowReviewError).apply { visibility = if (orderSubmitting && !state.busy && !state.message.startsWith("Booking ")) View.VISIBLE else View.GONE; text = state.message }
    }
    private fun confirm(page: View) {
        val route = state.route ?: return; val quote = state.quote ?: return; val error = validateDraft()
        if (error != null) { page.findViewById<TextView>(R.id.flowReviewError).apply { text = error; visibility = View.VISIBLE }; return }
        val amount = quantityText.trim().toDoubleOrNull() ?: return
        orderSubmitting = true
        viewModel.createOrder(CreateOrderInput(route.pickup.label, route.pickup.longitude, route.pickup.latitude, route.dropoff.label, route.dropoff.longitude, route.dropoff.latitude, vehicle.value, route.distanceKm, quote.cargoTons, amount, unit.key, category.key, packaging.key, CustomerBookingPolicy.cargoDescription(category.englishLabel, packaging.englishLabel, amount, unit.key, notesText), payment.key, quote.totalEtb))
    }

    private fun bindSuccess(page: View) {
        page.findViewById<MaterialButton>(R.id.flowSuccessViewOrder).setOnClickListener { viewModel.show(CustomerPage.ORDERS) }
        page.findViewById<MaterialButton>(R.id.flowSuccessAnother).setOnClickListener { reset() }
    }
    private fun renderSuccess() {
        val page = host.getChildAt(0) ?: return; val route = state.route; val quote = state.quote
        page.findViewById<TextView>(R.id.flowSuccessOrder).text = activity.getString(R.string.flow_order_number, trackingId ?: "—")
        page.findViewById<TextView>(R.id.flowSuccessRoute).text = route?.let { activity.getString(R.string.flow_route_line, it.pickup.label, it.dropoff.label) }.orEmpty()
        page.findViewById<TextView>(R.id.flowSuccessTruck).text = "${activity.getString(R.string.truck)}: ${vehicle.label}"
        page.findViewById<TextView>(R.id.flowSuccessTotal).text = quote?.let { activity.getString(R.string.flow_total_etb, number(it.totalEtb)) }.orEmpty()
    }
    private fun reset() {
        pickupQuery = ""; dropoffQuery = ""; quantityText = ""; notesText = ""; vehicle = vehicleOptions.first { it.value == "Dry Cargo" }; category = categories.first { it.key == "general_goods" }; packaging = packagingTypes.first { it.key == "loose_bulk" }; unit = units.first { it.key == "ton" }; payment = paymentMethods.first { it.key == "cash" }; trackingId = null; calculationRequested = false; orderSubmitting = false
        viewModel.resetRoute(); show(Step.ROUTE)
    }

    private fun validateCargo(): String? {
        val tons = cargoTons(); if (tons <= 0) return activity.getString(R.string.enter_valid_load)
        if (category.key == "other" && notesText.trim().length < 3) return activity.getString(R.string.native_cargo_other_required)
        return null
    }
    private fun validateDraft(): String? {
        validateCargo()?.let { return it }; val tons = cargoTons(); val capacity = CustomerBookingPolicy.truckCapacityTons(vehicle.value)
        if (capacity != null && tons > capacity) return activity.getString(R.string.capacity_exceeded, formatTons(tons), formatTons(capacity))
        if (packaging.key in setOf("container_20ft", "container_40ft") && vehicle.value != "Trailer") return activity.getString(R.string.native_container_requires_trailer)
        return null
    }

    private fun optionAdapter(view: HalloDropdownView, values: List<Option>, selected: Option, onSelected: (Option) -> Unit) {
        fun label(option: Option) = activity.getString(option.labelRes)
        view.setAdapter(ArrayAdapter(activity, android.R.layout.simple_dropdown_item_1line, values.map(::label))); view.setText(label(selected), false)
        view.setOnItemClickListener { _, _, p, _ -> values.getOrNull(p)?.let { view.setText(label(it), false); onSelected(it) } }
    }
    private fun suggestionAdapter(view: AutoCompleteTextView, places: List<CustomerPlace>) {
        view.setAdapter(ArrayAdapter(activity, android.R.layout.simple_dropdown_item_1line, places.map { it.label })); if (view.hasFocus() && places.isNotEmpty()) view.post { view.showDropDown() }
    }
    private fun replace(view: AutoCompleteTextView, value: String) { suppressText = true; view.setText(value, false); view.setSelection(value.length); suppressText = false }
    private fun cargoTons() = CustomerBookingPolicy.cargoToTons(quantityText.trim().toDoubleOrNull() ?: 0.0, unit.key)
    private fun formatTons(value: Double) = activity.getString(R.string.tons_short, number(value))
    private fun formatDistance(value: Double) = activity.getString(R.string.distance_km, NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 1 }.format(value))
    private fun number(value: Double) = NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 2 }.format(value)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    private companion object {
        val vehicleOptions = listOf(Truck("Pickup",3,R.drawable.truck_isuzu_5,"Pickup"),Truck("Van",5,R.drawable.truck_isuzu_5,"Van"),Truck("Isuzu 5 Ton",5,R.drawable.truck_isuzu_5,"Isuzu 5 Ton"),Truck("Dry Cargo",10,R.drawable.truck_10_ton,"Dry Cargo"),Truck("Refrigerated",15,R.drawable.truck_10_ton,"Refrigerated"),Truck("Truck 22 Ton",22,R.drawable.truck_22_ton,"Truck 22 Ton"),Truck("Truck 25 Ton",25,R.drawable.truck_25_ton,"Truck 25 Ton"),Truck("Truck 30 Ton",30,R.drawable.truck_30_ton,"Truck 30 Ton"),Truck("Trailer",45,R.drawable.truck_30_ton,"Trailer"))
        val categories = listOf(Option("food","Food",R.string.category_food),Option("grain_rice","Grain / rice",R.string.category_grain_rice),Option("cooking_oil","Cooking oil",R.string.category_cooking_oil),Option("metal_steel","Metal / steel",R.string.category_metal_steel),Option("construction_materials","Construction materials",R.string.category_construction),Option("general_goods","General goods",R.string.category_general_goods),Option("other","Other",R.string.option_other))
        val packagingTypes = listOf(Option("bagged","Bagged",R.string.packaging_bagged),Option("drum_tank","Drum / tank",R.string.packaging_drum_tank),Option("pallet","Pallet",R.string.packaging_pallet),Option("loose_bulk","Loose / bulk",R.string.packaging_loose_bulk),Option("container_20ft","20 ft container",R.string.packaging_20ft),Option("container_40ft","40 ft container",R.string.packaging_40ft),Option("other","Other",R.string.option_other))
        val units = listOf(Option("ton","Ton",R.string.unit_ton),Option("quintal","Quintal",R.string.unit_quintal))
        val paymentMethods = listOf(Option("cash","Cash on delivery",R.string.cash_on_delivery),Option("bank_telebirr","Bank / Telebirr",R.string.bank_telebirr))
    }
}
