package com.hallo.logistics.customer

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class CustomerAvatarController(
    private val activity: AppCompatActivity,
    private val viewModel: CustomerViewModel,
    private val setStatus: (String) -> Unit,
) {
    private var pendingCameraUri: Uri? = null

    private val galleryLauncher = activity.registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let(::prepareAndUpload)
    }

    private val cameraLauncher = activity.registerForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (saved && uri != null) prepareAndUpload(uri)
    }

    private val cameraPermissionLauncher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera() else setStatus(activity.getString(R.string.profile_photo_camera_permission))
    }

    fun render(
        profile: CustomerProfile?,
        signedUrl: String?,
        page: LinearLayout,
        profileDetails: TextView,
        busy: Boolean,
    ) {
        page.findViewWithTag<View>(PROFILE_AVATAR_TAG)?.let(page::removeView)
        page.findViewWithTag<View>(PROFILE_AVATAR_ACTIONS_TAG)?.let(page::removeView)

        val initial = CustomerDisplayPolicy.initial(profile?.fullName, "C")
        val section = LinearLayout(activity).apply {
            tag = PROFILE_AVATAR_TAG
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, dp(12), 0, dp(4))
        }
        val frame = FrameLayout(activity).apply {
            background = ContextCompat.getDrawable(activity, R.drawable.bg_step_idle)
            clipToOutline = true
        }
        val fallback = TextView(activity).apply {
            text = initial
            gravity = Gravity.CENTER
            textSize = 26f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(activity.getColor(R.color.hallo_navy))
        }
        val image = ImageView(activity).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
            contentDescription = activity.getString(R.string.profile_photo)
        }
        frame.addView(fallback, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        frame.addView(image, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        section.addView(frame, LinearLayout.LayoutParams(dp(92), dp(92)))

        if (!signedUrl.isNullOrBlank()) {
            image.tag = signedUrl
            activity.lifecycleScope.launch {
                val bitmap = CustomerSecureImageLoader.load(signedUrl)
                if (image.tag == signedUrl && bitmap != null) {
                    image.setImageBitmap(bitmap)
                    image.visibility = View.VISIBLE
                    fallback.visibility = View.GONE
                }
            }
        }

        val actions = LinearLayout(activity).apply {
            tag = PROFILE_AVATAR_ACTIONS_TAG
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
        }
        actions.addView(button(activity.getString(R.string.profile_photo_change), busy) { showSourceChooser() }, weightedParams(dp(4)))
        if (!profile?.avatarPath.isNullOrBlank()) {
            actions.addView(button(activity.getString(R.string.profile_photo_remove), busy) { confirmRemove() }, weightedParams(dp(4)))
        }
        section.addView(actions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        section.addView(TextView(activity).apply {
            text = activity.getString(R.string.profile_photo_private)
            gravity = Gravity.CENTER
            textSize = 11f
            setTextColor(activity.getColor(R.color.hallo_muted))
            setPadding(dp(12), dp(6), dp(12), 0)
        })

        page.addView(section, 1, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val oldUnsupported = activity.getString(R.string.profile_avatar_initials)
        profileDetails.text = profileDetails.text.toString()
            .replace("\n\n$oldUnsupported", "")
            .replace(oldUnsupported, "")
            .trimEnd()
    }

    private fun showSourceChooser() {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.profile_photo))
            .setItems(arrayOf(activity.getString(R.string.profile_photo_camera), activity.getString(R.string.profile_photo_gallery))) { _, which ->
                if (which == 0) requestCamera() else galleryLauncher.launch("image/*")
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun requestCamera() {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchCamera() {
        runCatching {
            val directory = File(activity.cacheDir, "customer-avatar").apply { mkdirs() }
            val file = File.createTempFile("avatar-", ".jpg", directory)
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
            pendingCameraUri = uri
            cameraLauncher.launch(uri)
        }.onFailure {
            pendingCameraUri = null
            setStatus(activity.getString(R.string.profile_photo_error))
        }
    }

    private fun prepareAndUpload(uri: Uri) {
        activity.lifecycleScope.launch {
            val result = runCatching { withContext(Dispatchers.Default) { CustomerAvatarImage.prepare(activity, uri) } }
            result.onSuccess(viewModel::uploadProfileAvatar)
                .onFailure { setStatus(it.message ?: activity.getString(R.string.profile_photo_error)) }
        }
    }

    private fun confirmRemove() {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.profile_photo_remove))
            .setMessage(activity.getString(R.string.profile_photo_private))
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(activity.getString(R.string.profile_photo_remove)) { _, _ -> viewModel.removeProfileAvatar() }
            .show()
    }

    private fun button(label: String, busy: Boolean, action: () -> Unit) = MaterialButton(activity).apply {
        text = label
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = dp(48)
        isEnabled = !busy
        setOnClickListener { action() }
    }

    private fun weightedParams(margin: Int) = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = margin
        marginEnd = margin
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    private companion object {
        const val PROFILE_AVATAR_TAG = "customer-profile-avatar"
        const val PROFILE_AVATAR_ACTIONS_TAG = "customer-profile-avatar-actions"
    }
}
