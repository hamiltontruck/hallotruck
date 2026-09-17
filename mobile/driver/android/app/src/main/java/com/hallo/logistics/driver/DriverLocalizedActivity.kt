package com.hallo.logistics.driver

import android.content.Context
import androidx.appcompat.app.AppCompatActivity

/** Shared locale boundary for every native Driver screen. */
abstract class DriverLocalizedActivity : AppCompatActivity() {
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(DriverLocaleManager.wrap(newBase))
    }
}
