package com.hallo.logistics.customer

enum class CustomerLanguage(val tag: String) {
    EN("en"),
    OR("om"),
    AM("am");

    companion object {
        fun fromTag(tag: String?): CustomerLanguage = when (tag?.substringBefore('-')?.lowercase()) {
            "om" -> OR
            "am" -> AM
            else -> EN
        }
    }
}
