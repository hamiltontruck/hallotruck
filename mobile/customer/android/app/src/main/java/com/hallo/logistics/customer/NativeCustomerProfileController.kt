package com.hallo.logistics.customer

import android.text.InputType
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

class NativeCustomerProfileController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
    private val requestLocation: () -> Unit,
    private val clearLocation: () -> Unit,
) {
    private val avatar = root.findViewById<TextView>(R.id.nativeProfileAvatar)
    private val name = root.findViewById<TextView>(R.id.nativeProfileName)
    private val meta = root.findViewById<TextView>(R.id.nativeProfileMeta)
    private val edit = root.findViewById<MaterialButton>(R.id.nativeProfileEdit)
    private val locationStatus = root.findViewById<TextView>(R.id.nativeProfileLocationStatus)
    private val shareLocation = root.findViewById<MaterialButton>(R.id.nativeProfileShareLocation)
    private val clearLocationButton = root.findViewById<MaterialButton>(R.id.nativeProfileClearLocation)

    init {
        edit.setOnClickListener { viewModel.state.value.profile?.let(::showEditDialog) }
        shareLocation.setOnClickListener { requestLocation() }
        clearLocationButton.setOnClickListener { clearLocation() }
        root.findViewById<MaterialButton>(R.id.nativeProfileSignOut).setOnClickListener { viewModel.signOut() }
    }

    fun render(state: CustomerUiState, location: CustomerPlace?) {
        val profile = state.profile
        avatar.text = CustomerDisplayPolicy.initial(profile?.fullName, "C")
        name.text = profile?.fullName ?: activity.getString(R.string.customer_generic)
        meta.text = buildString {
            append(activity.getString(R.string.phone)).append(": ").append(profile?.phone ?: "—")
            append("\n").append(activity.getString(R.string.email)).append(": ").append(profile?.email ?: "—")
            append("\n").append(activity.getString(R.string.home_address)).append(": ").append(profile?.homeAddress ?: "—")
            append("\n").append(activity.getString(R.string.account_type)).append(": ").append(profile?.customerType ?: "—")
            if (profile?.customerType == "business") {
                append("\n").append(activity.getString(R.string.company)).append(": ").append(profile.companyName ?: "—")
            }
            append("\n").append(activity.getString(R.string.joined)).append(": ").append(formatDate(profile?.createdAt))
        }
        edit.isEnabled = profile != null && !state.busy
        locationStatus.text = if (location == null) {
            copy(
                "Location is not shared. You can continue using the app normally.",
                "Bakki hin qoodamne. App kana akkuma jirutti fayyadamuu dandeessa.",
                "አካባቢው አልተጋራም። መተግበሪያውን መጠቀም መቀጠል ይችላሉ።",
            )
        } else {
            copy(
                "Location is available for this app session.",
                "Bakki session app kanaaf qoodameera.",
                "አካባቢው ለዚህ የመተግበሪያ ክፍለ ጊዜ ይገኛል።",
            )
        }
        clearLocationButton.visibility = if (location == null) View.GONE else View.VISIBLE
    }

    private fun showEditDialog(profile: CustomerProfile) {
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(4), dp(18), 0)
        }
        val error = TextView(activity).apply {
            setTextColor(activity.getColor(R.color.hallo_danger))
            textSize = 12f
            visibility = View.GONE
        }
        val fullName = field(activity.getString(R.string.full_name), profile.fullName)
        val phone = field(activity.getString(R.string.phone), profile.phone, InputType.TYPE_CLASS_PHONE)
        val email = field(activity.getString(R.string.email), profile.email, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val home = field(activity.getString(R.string.home_address), profile.homeAddress)
        val type = Spinner(activity).apply {
            adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item, listOf(activity.getString(R.string.individual), activity.getString(R.string.business)))
            setSelection(if (profile.customerType == "business") 1 else 0)
        }
        val company = field(activity.getString(R.string.company_name), profile.companyName)
        listOf(error, fullName, phone, email, home, type, company).forEach { view ->
            content.addView(view, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(8)
            })
        }

        val dialog = AlertDialog.Builder(activity)
            .setTitle(R.string.edit_profile)
            .setView(content)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.save_profile, null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val input = CustomerProfileUpdateInput(
                    fullName = fullName.text.toString(),
                    phone = phone.text.toString(),
                    email = email.text.toString(),
                    homeAddress = home.text.toString(),
                    customerType = if (type.selectedItemPosition == 1) "business" else "individual",
                    companyName = company.text.toString(),
                )
                val validated = runCatching { CustomerProfilePolicy.validate(input) }
                if (validated.isFailure) {
                    error.text = validated.exceptionOrNull()?.message ?: activity.getString(R.string.native_profile_invalid)
                    error.visibility = View.VISIBLE
                    return@setOnClickListener
                }
                viewModel.updateProfile(validated.getOrThrow())
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun field(hint: String, value: String?, type: Int = InputType.TYPE_CLASS_TEXT) = EditText(activity).apply {
        this.hint = hint
        setText(value.orEmpty())
        inputType = type
        minHeight = dp(52)
        setPadding(dp(10), dp(8), dp(10), dp(8))
    }

    private fun formatDate(value: String?): String {
        if (value.isNullOrBlank()) return "—"
        return runCatching {
            DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
                .withLocale(activity.resources.configuration.locales[0] ?: Locale.getDefault())
                .withZone(ZoneId.systemDefault())
                .format(Instant.parse(value))
        }.getOrDefault(value.substringBefore('T'))
    }

    private fun copy(en: String, om: String, am: String): String = when (CustomerLanguage.fromTag(AppCompatDelegateCompat.languageTag(activity))) {
        CustomerLanguage.OR -> om
        CustomerLanguage.AM -> am
        CustomerLanguage.EN -> en
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
}

/** Small locale helper kept presentation-only. */
private object AppCompatDelegateCompat {
    fun languageTag(activity: AppCompatActivity): String = activity.resources.configuration.locales[0]?.toLanguageTag().orEmpty()
}
