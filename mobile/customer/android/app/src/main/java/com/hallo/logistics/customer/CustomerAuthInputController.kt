package com.hallo.logistics.customer

import android.text.InputFilter
import android.text.InputType
import android.text.method.DigitsKeyListener
import android.text.method.PasswordTransformationMethod
import android.view.View
import android.view.ViewParent
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import com.google.android.material.textfield.TextInputLayout

/**
 * V5 auth-field contract kept separate from backend/session logic.
 *
 * Email never keeps whitespace, Ethiopian phone input stays compact, and both login and signup use
 * the same six-digit numeric PIN contract as the root HALLO role authentication flow.
 */
object CustomerAuthInputController {
    fun install(activity: AppCompatActivity) {
        configureEmail(activity.findViewById(R.id.email))
        configurePhone(activity.findViewById(R.id.phone))
        configurePin(activity.findViewById(R.id.password), activity.getString(R.string.v5_pin_hint))
        configurePin(activity.findViewById(R.id.confirmPin), activity.getString(R.string.v5_confirm_pin_hint))
    }

    private fun configureEmail(field: EditText?) {
        field ?: return
        field.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        field.filters = arrayOf(InputFilter.LengthFilter(254))
        var changing = false
        field.doAfterTextChanged { editable ->
            if (changing) return@doAfterTextChanged
            val original = editable?.toString().orEmpty()
            val clean = original.filterNot(Char::isWhitespace)
            if (clean == original) return@doAfterTextChanged
            changing = true
            field.setText(clean)
            field.setSelection(clean.length)
            changing = false
        }
    }

    private fun configurePhone(field: EditText?) {
        field ?: return
        field.inputType = InputType.TYPE_CLASS_PHONE
        field.filters = arrayOf(InputFilter.LengthFilter(13))
        var changing = false
        field.doAfterTextChanged { editable ->
            if (changing) return@doAfterTextChanged
            val original = editable?.toString().orEmpty()
            val clean = buildString {
                original.forEach { character ->
                    when {
                        character.isDigit() -> append(character)
                        character == '+' && isEmpty() -> append(character)
                    }
                }
            }.take(13)
            if (clean == original) return@doAfterTextChanged
            changing = true
            field.setText(clean)
            field.setSelection(clean.length)
            changing = false
        }
    }

    private fun configurePin(field: EditText?, hint: String) {
        field ?: return
        parentInputLayout(field)?.hint = hint
        var changing = false

        fun enforceNumericPin() {
            field.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            field.keyListener = DigitsKeyListener.getInstance("0123456789")
            field.transformationMethod = PasswordTransformationMethod.getInstance()
            field.filters = arrayOf(InputFilter.LengthFilter(6))
        }

        enforceNumericPin()
        field.onFocusChangeListener = View.OnFocusChangeListener { _, focused ->
            if (focused) {
                enforceNumericPin()
                field.post { field.setSelection(field.text?.length ?: 0) }
            }
        }
        field.doAfterTextChanged { editable ->
            if (changing) return@doAfterTextChanged
            val original = editable?.toString().orEmpty()
            val clean = original.filter(Char::isDigit).take(6)
            if (clean == original) return@doAfterTextChanged
            changing = true
            field.setText(clean)
            field.setSelection(clean.length)
            changing = false
        }
    }

    private fun parentInputLayout(view: View): TextInputLayout? {
        var parent: ViewParent? = view.parent
        while (parent != null) {
            if (parent is TextInputLayout) return parent
            parent = parent.parent
        }
        return null
    }
}
