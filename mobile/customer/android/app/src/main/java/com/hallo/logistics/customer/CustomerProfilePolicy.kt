package com.hallo.logistics.customer

object CustomerProfilePolicy {
    private val phonePattern = Regex("^(09\\d{8}|\\+2519\\d{8})$")
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    fun validate(input: CustomerProfileUpdateInput): CustomerProfileUpdateInput {
        val fullName = input.fullName.trim().replace(Regex("\\s+"), " ")
        val phone = input.phone.trim()
        val email = input.email.trim()
        val homeAddress = input.homeAddress.trim()
        val customerType = input.customerType.trim().lowercase()
        val companyName = input.companyName.trim()

        require(fullName.length >= 2) { "Enter your full name" }
        require(phonePattern.matches(phone)) { "Phone must be 09xxxxxxxx or +2519xxxxxxxx" }
        require(email.isBlank() || emailPattern.matches(email)) { "Enter a valid email address" }
        require(customerType in setOf("individual", "business")) { "Choose a valid customer type" }
        require(customerType != "business" || companyName.isNotBlank()) { "Company name is required for a business account" }

        return CustomerProfileUpdateInput(
            fullName = fullName,
            phone = phone,
            email = email,
            homeAddress = homeAddress,
            customerType = customerType,
            companyName = if (customerType == "business") companyName else "",
        )
    }
}
