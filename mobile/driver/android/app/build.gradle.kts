plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.serialization") }
fun escapedProperty(name: String): String = providers.gradleProperty(name).orNull.orEmpty().replace("\\", "\\\\").replace("\"", "\\\"")
android {
 namespace = "com.hallo.logistics.driver"; compileSdk = 35
 defaultConfig { applicationId = "com.hallo.logistics.driver"; minSdk = 26; targetSdk = 35; versionCode = 4; versionName = "0.4.0"; testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"; buildConfigField("String", "SUPABASE_URL", "\"${escapedProperty("SUPABASE_URL")}\""); buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${escapedProperty("SUPABASE_PUBLISHABLE_KEY")}\"") }
 buildFeatures { viewBinding = true; buildConfig = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }; kotlin { jvmToolchain(21) }
 lint { disable += "NullSafeMutableLiveData" }
 packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
 implementation("androidx.core:core-ktx:1.16.0"); implementation("androidx.appcompat:appcompat:1.7.1"); implementation("androidx.activity:activity-ktx:1.10.1"); implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0"); implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.0"); implementation("com.google.android.material:material:1.12.0"); implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
 implementation(platform("io.github.jan-tennert.supabase:bom:3.1.4")); implementation("io.github.jan-tennert.supabase:auth-kt"); implementation("io.github.jan-tennert.supabase:postgrest-kt"); implementation("io.github.jan-tennert.supabase:functions-kt"); implementation("io.github.jan-tennert.supabase:storage-kt"); implementation("io.github.jan-tennert.supabase:realtime-kt"); implementation("io.ktor:ktor-client-okhttp:3.1.3")
 implementation("com.google.android.gms:play-services-location:21.3.0")
 testImplementation("junit:junit:4.13.2")
}
