package com.hallo.logistics.customer

object CustomerCompletionPolicy {
    data class RatingInput(val score: Int, val comment: String?)

    fun rating(score: Int, comment: String): RatingInput {
        require(score in 1..5) { "Choose a rating from 1 to 5 stars" }
        val clean = comment.trim().replace(Regex("\\s+"), " ")
        require(clean.length <= 500) { "Rating comment must be 500 characters or fewer" }
        return RatingInput(score, clean.takeIf { it.isNotBlank() })
    }
}
