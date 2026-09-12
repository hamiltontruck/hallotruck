package com.hallo.logistics.driver

import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout

class DriverAuthUiController(
    private val activity: AppCompatActivity,
    host: LinearLayout,
    private val onSignIn: (email: String, pin: String) -> Unit,
    private val onSignUp: (name: String, phone: String, email: String, pin: String, confirmPin: String) -> Unit,
) {
    private val root = LayoutInflater.from(activity).inflate(R.layout.driver_auth_modern, host, false)
    private val languages = root.findViewById<MaterialButtonToggleGroup>(R.id.authLanguages)
    private val languageEn = root.findViewById<MaterialButton>(R.id.authEn)
    private val languageOr = root.findViewById<MaterialButton>(R.id.authOr)
    private val languageAm = root.findViewById<MaterialButton>(R.id.authAm)
    private val title = root.findViewById<TextView>(R.id.authTitleModern)
    private val subtitle = root.findViewById<TextView>(R.id.authSubtitleModern)
    private val prompt = root.findViewById<TextView>(R.id.authPromptModern)
    private val signupFields = root.findViewById<LinearLayout>(R.id.authSignupFields)
    private val fullName = root.findViewById<TextInputEditText>(R.id.authFullName)
    private val phone = root.findViewById<TextInputEditText>(R.id.authPhone)
    private val email = root.findViewById<TextInputEditText>(R.id.authEmail)
    private val pin = root.findViewById<TextInputEditText>(R.id.authPin)
    private val confirmPinLayout = root.findViewById<TextInputLayout>(R.id.authConfirmPinLayout)
    private val confirmPin = root.findViewById<TextInputEditText>(R.id.authConfirmPin)
    private val submit = root.findViewById<MaterialButton>(R.id.authSubmitModern)
    private val mode = root.findViewById<MaterialButton>(R.id.authModeModern)
    private var signup = false

    init {
        host.removeAllViews()
        host.setPadding(0, 0, 0, 0)
        host.addView(root)
        configureLanguages()
        mode.setOnClickListener {
            signup = !signup
            renderMode(clearConfirmation = true)
        }
        submit.setOnClickListener {
            if (signup) {
                onSignUp(text(fullName), text(phone), text(email), text(pin), text(confirmPin))
            } else {
                onSignIn(text(email), text(pin))
            }
        }
        renderMode(clearConfirmation = false)
    }

    fun setBusy(busy: Boolean) {
        submit.isEnabled = !busy
        mode.isEnabled = !busy
        fullName.isEnabled = !busy
        phone.isEnabled = !busy
        email.isEnabled = !busy
        pin.isEnabled = !busy
        confirmPin.isEnabled = !busy
    }

    private fun configureLanguages() {
        val selected = DriverLocaleManager.saved(activity)
        languages.check(
            when (selected) {
                DriverLocaleManager.EN -> languageEn.id
                DriverLocaleManager.AM -> languageAm.id
                else -> languageOr.id
            },
        )
        languages.addOnButtonCheckedListener { _, checkedId, checked ->
            if (!checked) return@addOnButtonCheckedListener
            val requested = when (checkedId) {
                languageEn.id -> DriverLocaleManager.EN
                languageAm.id -> DriverLocaleManager.AM
                else -> DriverLocaleManager.OR
            }
            if (requested == DriverLocaleManager.saved(activity)) return@addOnButtonCheckedListener
            DriverLocaleManager.apply(activity, requested)
            activity.recreate()
        }
    }

    private fun renderMode(clearConfirmation: Boolean) {
        signupFields.visibility = if (signup) View.VISIBLE else View.GONE
        confirmPinLayout.visibility = if (signup) View.VISIBLE else View.GONE
        title.setText(if (signup) R.string.driver_auth_signup_title else R.string.driver_auth_signin_title)
        subtitle.setText(if (signup) R.string.driver_auth_signup_subtitle else R.string.driver_auth_signin_subtitle)
        prompt.setText(if (signup) R.string.driver_auth_existing_prompt else R.string.driver_auth_new_prompt)
        submit.setText(if (signup) R.string.create_driver_account else R.string.sign_in)
        mode.setText(if (signup) R.string.already_registered else R.string.create_driver_account)
        if (clearConfirmation) confirmPin.text?.clear()
    }

    private fun text(view: TextInputEditText): String = view.text?.toString().orEmpty().trim()
}
