package com.hallo.logistics.customer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerCompletionPolicyTest {
    @Test fun ratingAcceptsOneToFiveAndNormalizesOptionalComment() {
        val rating = CustomerCompletionPolicy.rating(5, "  Great   delivery  ")
        assertEquals(5, rating.score)
        assertEquals("Great delivery", rating.comment)
        assertNull(CustomerCompletionPolicy.rating(4, "   ").comment)
    }

    @Test fun ratingFailsClosedOutsideOneToFive() {
        listOf(0, 6).forEach { score ->
            val failure = runCatching { CustomerCompletionPolicy.rating(score, "") }.exceptionOrNull()
            assertTrue(failure is IllegalArgumentException)
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun ratingCommentIsLimitedToFiveHundredCharacters() {
        CustomerCompletionPolicy.rating(5, "x".repeat(501))
    }
}
