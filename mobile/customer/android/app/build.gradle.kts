plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val generatedHalloResources = layout.buildDirectory.dir("generated/halloBrandResources")
val prepareHalloResources by tasks.registering(Copy::class) {
    into(generatedHalloResources)
    from(rootProject.file("../../../apps/customer-mobile-app/src/hallo-logistics-logo.webp")) {
        into("drawable-nodpi")
        rename { "hallo_logistics_logo.webp" }
    }
    val vehicleAssets = mapOf(
        "cab-over-box-truck-5-ton.webp" to "truck_isuzu_5.webp",
        "dry-cargo-truck-10-ton.webp" to "truck_10_ton.webp",
        "cargo-truck-22-ton.webp" to "truck_22_ton.webp",
        "cargo-truck-25-ton.webp" to "truck_25_ton.webp",
        "cargo-truck-30-ton.webp" to "truck_30_ton.webp",
    )
    vehicleAssets.forEach { (source, target) ->
        from(rootProject.file("../../../public/vehicles/$source")) {
            into("drawable-nodpi")
            rename { target }
        }
    }
}

fun escapedProperty(name: String): String = providers.gradleProperty(name).orNull.orEmpty()
    .replace("\\", "\\\\").replace("\"", "\\\"")

android {
    namespace = "com.hallo.logistics.customer"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.hallo.logistics.customer"
        minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "SUPABASE_URL", "\"${escapedProperty("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${escapedProperty("SUPABASE_PUBLISHABLE_KEY")}\"")
        buildConfigField("String", "MAPTILER_KEY", "\"${escapedProperty("MAPTILER_KEY")}\"")
    }
    buildFeatures { viewBinding = true; buildConfig = true }
    sourceSets.getByName("main").res.srcDir(generatedHalloResources)
    compileOptions { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }
    kotlin { jvmToolchain(21) }
    lint {
        // Lifecycle 2.9's LiveData detector is binary-incompatible with AGP 8.7 lint.
        // This app uses StateFlow only; keep every other lint check enabled.
        disable += "NullSafeMutableLiveData"
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

tasks.named("preBuild").configure { dependsOn(prepareHalloResources) }

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation(platform("io.github.jan-tennert.supabase:bom:3.1.4"))
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.ktor:ktor-client-okhttp:3.1.3")
    testImplementation("junit:junit:4.13.2")
}
