package com.hallo.logistics.customer

import android.view.View
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputLayout
import com.hallo.logistics.customer.databinding.ItemCustomerTruckBinding
import java.text.NumberFormat
import java.util.Locale

/**
 * Native Kotlin/XML booking presentation using the same CustomerViewModel and backend contracts
 * as the production Customer Portal. This class owns presentation only.
 */
class NativeCustomerBookController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
    private val requestMyLocation: () -> Unit,
) {
    private data class Option(val key: String, val englishLabel: String, val labelRes: Int)
    private data class Truck(val value: String, val capacity: Int, val imageRes: Int, val label: String)

    private val pickupLayout = root.findViewById<TextInputLayout>(R.id.nativeBookPickupLayout)
    private val dropoffLayout = root.findViewById<TextInputLayout>(R.id.nativeBookDropoffLayout)
    private val pickup = root.findViewById<AutoCompleteTextView>(R.id.nativeBookPickup)
    private val dropoff = root.findViewById<AutoCompleteTextView>(R.id.nativeBookDropoff)
    private val map = root.findViewById<CustomerLiveMapView>(R.id.nativeBookMap)
    private val trucks = root.findViewById<LinearLayout>(R.id.nativeBookTruckOptions)
    private val category = root.findViewById<AutoCompleteTextView>(R.id.nativeBookCategory)
    private val packaging = root.findViewById<AutoCompleteTextView>(R.id.nativeBookPackaging)
    private val quantity = root.findViewById<EditText>(R.id.nativeBookQuantity)
    private val unit = root.findViewById<AutoCompleteTextView>(R.id.nativeBookUnit)
    private val notes = root.findViewById<EditText>(R.id.nativeBookNotes)
    private val payment = root.findViewById<AutoCompleteTextView>(R.id.nativeBookPayment)
    private val loadSummary = root.findViewById<TextView>(R.id.nativeBookLoadSummary)
    private val quoteText = root.findViewById<TextView>(R.id.nativeBookQuote)
    private val calculate = root.findViewById<MaterialButton>(R.id.nativeBookCalculate)
    private val review = root.findViewById<MaterialButton>(R.id.nativeBookReview)

    private var selectedVehicle = vehicleOptions.first { it.value == "Dry Cargo" }
    private var selectedCategory = categories.first { it.key == "general_goods" }
    private var selectedPackaging = packagingTypes.first { it.key == "loose_bulk" }
    private var selectedUnit = units.first { it.key == "ton" }
    private var selectedPayment = paymentMethods.first { it.key == "cash" }
    private var pickupSuggestions: List<CustomerPlace> = emptyList()
    private var dropoffSuggestions: List<CustomerPlace> = emptyList()
    private var suppressTextCallbacks = false
    private var calculationRequested = false

    init {
        configureDropdowns()
        renderTruckOptions()
        bindActions()
        updateLoadSummary()
    }

    fun render(state: CustomerUiState) {
        pickupSuggestions = state.pickupSuggestions
        dropoffSuggestions = state.dropoffSuggestions
        updateSuggestionAdapter(pickup, pickupSuggestions)
        updateSuggestionAdapter(dropoff, dropoffSuggestions)

        state.selectedPickup?.let { selected ->
            if (!pickup.text.toString().equals(selected.label, ignoreCase = true)) replaceText(pickup, selected.label)
        }
        state.selectedDropoff?.let { selected ->
            if (!dropoff.text.toString().equals(selected.label, ignoreCase = true)) replaceText(dropoff, selected.label)
        }

        pickupLayout.error = state.placeSearchMessage.takeIf { pickup.hasFocus() }
        dropoffLayout.error = state.placeSearchMessage.takeIf { dropoff.hasFocus() }
        map.showBooking(state.selectedPickup, state.selectedDropoff, state.route)
        renderQuoteState(state)

        val validation = validateDraft()
        calculate.isEnabled = !state.busy && pickup.text.isNotBlank() && dropoff.text.isNotBlank() && validation == null
        review.isEnabled = !state.busy && state.quote != null && state.route != null && validation == null
        updateLoadSummary()
    }

    fun setCurrentPickup(place: CustomerPlace) {
        calculationRequested = false
        replaceText(pickup, place.label)
        viewModel.selectPlace(place, pickup = true)
    }

    private fun renderQuoteState(state: CustomerUiState) {
        val quote = state.quote
        val route = state.route
        val danger = calculationRequested && !state.busy && quote == null
        quoteText.setTextColor(activity.getColor(if (danger) R.color.hallo_danger else R.color.hallo_text))
        quoteText.text = when {
            quote != null && route != null -> {
                calculationRequested = false
                buildString {
                    append(route.pickup.label).append("\n→ ").append(route.dropoff.label)
                    append("\n").append(selectedVehicle.value)
                    append(" · ").append(formatDistance(route.distanceKm))
                    append(" · ").append(activity.getString(R.string.minutes_short, route.durationMinutes))
                    append("\n").append(formatTons(quote.cargoTons))
                    append(" · ETB ").append(number(quote.totalEtb))
                }
            }
            calculationRequested && state.busy && route == null -> activity.getString(R.string.route_calculating)
            calculationRequested && route != null -> buildString {
                append(activity.getString(
                    R.string.native_route_only_summary,
                    route.pickup.label,
                    route.dropoff.label,
                    formatDistance(route.distanceKm),
                    activity.getString(R.string.minutes_short, route.durationMinutes),
                ))
                if (state.message.isNotBlank()) append("\n\n").append(state.message)
            }
            calculationRequested && !state.busy -> state.message.ifBlank { activity.getString(R.string.native_route_failed) }
            else -> activity.getString(R.string.secure_quote_placeholder)
        }
    }

    private fun bindActions() {
        pickup.doAfterTextChanged { value ->
            if (!suppressTextCallbacks) {
                calculationRequested = false
                viewModel.placeInputChanged(value?.toString().orEmpty(), pickup = true)
            }
        }
        dropoff.doAfterTextChanged { value ->
            if (!suppressTextCallbacks) {
                calculationRequested = false
                viewModel.placeInputChanged(value?.toString().orEmpty(), pickup = false)
            }
        }
        quantity.doAfterTextChanged {
            calculationRequested = false
            viewModel.bookingInputChanged()
            updateLoadSummary()
        }
        notes.doAfterTextChanged { updateLoadSummary() }

        pickup.setOnItemClickListener { _, _, position, _ ->
            pickupSuggestions.getOrNull(position)?.let {
                calculationRequested = false
                viewModel.selectPlace(it, pickup = true)
            }
        }
        dropoff.setOnItemClickListener { _, _, position, _ ->
            dropoffSuggestions.getOrNull(position)?.let {
                calculationRequested = false
                viewModel.selectPlace(it, pickup = false)
            }
        }

        root.findViewById<MaterialButton>(R.id.nativeBookMyLocation).setOnClickListener {
            calculationRequested = false
            requestMyLocation()
        }
        root.findViewById<MaterialButton>(R.id.nativeBookSwap).setOnClickListener {
            calculationRequested = false
            val oldPickup = pickup.text.toString()
            val oldDropoff = dropoff.text.toString()
            replaceText(pickup, oldDropoff)
            replaceText(dropoff, oldPickup)
            viewModel.swapRoute()
        }
        root.findViewById<MaterialButton>(R.id.nativeBookReset).setOnClickListener {
            calculationRequested = false
            replaceText(pickup, "")
            replaceText(dropoff, "")
            quantity.setText("")
            notes.setText("")
            viewModel.resetRoute()
        }

        calculate.setOnClickListener {
            val error = validateDraft()
            if (error != null) {
                showError(error)
                return@setOnClickListener
            }
            calculationRequested = true
            quoteText.setTextColor(activity.getColor(R.color.hallo_muted))
            quoteText.text = activity.getString(R.string.route_calculating)
            viewModel.calculateAutomaticRoute(
                pickup.text.toString(),
                dropoff.text.toString(),
                selectedVehicle.value,
                cargoTons(),
            )
        }
        review.setOnClickListener { showReview() }
    }

    private fun configureDropdowns() {
        bindOptions(category, categories, selectedCategory) {
            selectedCategory = it
            updateLoadSummary()
        }
        bindOptions(packaging, packagingTypes, selectedPackaging) {
            selectedPackaging = it
            updateLoadSummary()
        }
        bindOptions(unit, units, selectedUnit) {
            selectedUnit = it
            calculationRequested = false
            viewModel.bookingInputChanged()
            updateLoadSummary()
        }
        bindOptions(payment, paymentMethods, selectedPayment) { selectedPayment = it }
    }

    private fun bindOptions(
        view: AutoCompleteTextView,
        values: List<Option>,
        selected: Option,
        onSelected: (Option) -> Unit,
    ) {
        fun label(option: Option) = activity.getString(option.labelRes)
        val labels = values.map(::label)
        view.threshold = 0
        view.setAdapter(ArrayAdapter(activity, android.R.layout.simple_dropdown_item_1line, labels))
        view.setText(label(selected), false)
        view.setOnItemClickListener { _, _, position, _ ->
            values.getOrNull(position)?.let { option ->
                view.setText(label(option), false)
                onSelected(option)
            }
        }
    }

    private fun renderTruckOptions() {
        trucks.removeAllViews()
        vehicleOptions.forEach { truck ->
            val item = ItemCustomerTruckBinding.inflate(activity.layoutInflater, trucks, false)
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
                    renderTruckOptions()
                    updateLoadSummary()
                }
            }
            trucks.addView(item.root)
        }
    }

    private fun updateSuggestionAdapter(view: AutoCompleteTextView, places: List<CustomerPlace>) {
        view.setAdapter(ArrayAdapter(activity, android.R.layout.simple_dropdown_item_1line, places.map { it.label }))
        if (view.hasFocus() && places.isNotEmpty()) view.post { view.showDropDown() }
    }

    private fun validateDraft(): String? {
        val amount = quantity.text.toString().trim().toDoubleOrNull() ?: 0.0
        val tons = CustomerBookingPolicy.cargoToTons(amount, selectedUnit.key)
        if (tons <= 0) return activity.getString(R.string.enter_valid_load)
        val capacity = CustomerBookingPolicy.truckCapacityTons(selectedVehicle.value)
        if (capacity != null && tons > capacity) {
            return activity.getString(R.string.capacity_exceeded, formatTons(tons), formatTons(capacity))
        }
        if (selectedCategory.key == "other" && notes.text.toString().trim().length < 3) {
            return activity.getString(R.string.native_cargo_other_required)
        }
        if (selectedPackaging.key in setOf("container_20ft", "container_40ft") && selectedVehicle.value != "Trailer") {
            return activity.getString(R.string.native_container_requires_trailer)
        }
        return null
    }

    private fun updateLoadSummary() {
        val amount = quantity.text.toString().trim().toDoubleOrNull() ?: 0.0
        val tons = CustomerBookingPolicy.cargoToTons(amount, selectedUnit.key)
        val capacity = CustomerBookingPolicy.truckCapacityTons(selectedVehicle.value)
        val capacityText = capacity?.let(::formatTons) ?: "—"
        loadSummary.text = if (amount <= 0) {
            activity.getString(R.string.native_truck_capacity_summary, selectedVehicle.label, capacityText)
        } else {
            activity.getString(R.string.native_load_capacity_summary, formatTons(tons), selectedVehicle.label, capacityText)
        }
        loadSummary.setTextColor(activity.getColor(if (validateDraft() == null || amount <= 0) R.color.hallo_muted else R.color.hallo_danger))
    }

    private fun showReview() {
        val state = viewModel.state.value
        val route = state.route ?: return
        val quote = state.quote ?: return
        val validation = validateDraft()
        if (validation != null) {
            showError(validation)
            return
        }
        val amount = quantity.text.toString().trim().toDoubleOrNull() ?: return
        val description = CustomerBookingPolicy.cargoDescription(
            selectedCategory.englishLabel,
            selectedPackaging.englishLabel,
            amount,
            selectedUnit.key,
            notes.text.toString(),
        )
        val summary = buildString {
            append(route.pickup.label).append("\n→ ").append(route.dropoff.label)
            append("\n\n").append(activity.getString(R.string.truck)).append(": ").append(selectedVehicle.label)
            append("\n").append(activity.getString(R.string.load)).append(": ").append(formatTons(cargoTons()))
            append("\n").append(activity.getString(R.string.distance)).append(": ").append(formatDistance(route.distanceKm))
            append("\n").append(activity.getString(R.string.payment)).append(": ").append(activity.getString(selectedPayment.labelRes))
            append("\n\n").append(activity.getString(R.string.quote)).append(": ETB ").append(number(quote.totalEtb))
        }
        AlertDialog.Builder(activity)
            .setTitle(R.string.booking_review)
            .setMessage(summary)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.confirm_order) { _, _ ->
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
            .show()
    }

    private fun showError(message: String) {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.book_truck))
            .setMessage(message)
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun replaceText(view: AutoCompleteTextView, value: String) {
        suppressTextCallbacks = true
        view.setText(value, false)
        view.setSelection(value.length)
        suppressTextCallbacks = false
    }

    private fun cargoTons(): Double = CustomerBookingPolicy.cargoToTons(
        quantity.text.toString().trim().toDoubleOrNull() ?: 0.0,
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
