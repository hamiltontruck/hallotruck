package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.findViewTreeViewModelStoreOwner
import androidx.lifecycle.ViewModelProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.text.NumberFormat
import java.util.WeakHashMap

/**
 * Final presentation layer for the approved HALLO Customer Android visual language.
 *
 * Business state remains owned by CustomerViewModel/MainActivity. This adapter only composes
 * existing views and mirrors existing actions, so auth, route, quote, payment, tracking and
 * order contracts remain unchanged.
 */
object CustomerParityUiV2 {
    private const val TAG_TOP_CHROME = "customer-parity-top-chrome"
    private const val TAG_HOME_ANCHOR = "customer-parity-home-anchor"
    private const val TAG_HOME_QUICK = "customer-parity-home-quick"
    private const val TAG_HOME_METRICS = "customer-parity-home-metrics"
    private const val TAG_HOME_PROMO = "customer-parity-home-promo"
    private const val TAG_HERO_TAGLINE = "customer-parity-hero-tagline"
    private const val TAG_BOOK_HEADER = "customer-parity-book-header"
    private const val TAG_BOOK_STEPPER = "customer-parity-book-stepper"
    private const val TAG_BOOK_ROUTE_HEADER = "customer-parity-book-route-header"
    private const val TAG_SUCCESS = "customer-parity-book-success"
    private const val TAG_SUCCESS_TRACKING = "customer-parity-success-tracking"
    private const val TAG_TOP_BADGE = "customer-parity-top-badge"

    private val installed = WeakHashMap<View, Boolean>()
    private val busy = WeakHashMap<View, Boolean>()
    private val dismissedSuccess = WeakHashMap<View, String>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        root.post { apply(root) }
        root.viewTreeObserver.addOnGlobalLayoutListener {
            if (busy[root] == true) return@addOnGlobalLayoutListener
            busy[root] = true
            try {
                apply(root)
            } finally {
                busy[root] = false
            }
        }
    }

    private fun apply(root: View) {
        ensureTopChrome(root)
        styleHome(root)
        styleBooking(root)
        styleOrders(root)
        stylePayments(root)
        styleTracking(root)
        styleProfile(root)
        renderSuccessState(root)
    }

    private fun ensureTopChrome(root: View) {
        val shell = root.findViewById<LinearLayout>(R.id.customerShell) ?: return
        val chrome = shell.findViewWithTag<MaterialCardView>(TAG_TOP_CHROME) ?: MaterialCardView(root.context).apply {
            tag = TAG_TOP_CHROME
            radius = dp(root, 22).toFloat()
            cardElevation = 0f
            strokeWidth = 1
            strokeColor = color(root, R.color.hallo_line)
            setCardBackgroundColor(Color.WHITE)
            setContentPadding(dp(root, 12), dp(root, 10), dp(root, 10), dp(root, 10))

            val column = LinearLayout(root.context).apply {
                orientation = LinearLayout.VERTICAL
            }
            val row = LinearLayout(root.context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            row.addView(ImageView(root.context).apply {
                setImageResource(R.drawable.hallo_logistics_logo)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                contentDescription = "HALLO Logistics"
            }, LinearLayout.LayoutParams(dp(root, 46), dp(root, 46)))

            row.addView(LinearLayout(root.context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(root, 9), 0, dp(root, 4), 0)
                addView(TextView(root.context).apply {
                    text = "HALLO LOGISTICS"
                    setTextColor(color(root, R.color.hallo_navy))
                    textSize = 15f
                    setTypeface(typeface, Typeface.BOLD)
                    letterSpacing = 0.04f
                    maxLines = 1
                    ellipsize = android.text.TextUtils.TruncateAt.END
                })
                addView(TextView(root.context).apply {
                    text = root.context.getString(R.string.customer_brand_tagline)
                    setTextColor(color(root, R.color.hallo_muted))
                    textSize = 10f
                })
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

            row.addView(MaterialButton(root.context).apply {
                minWidth = 0
                minimumWidth = 0
                minHeight = dp(root, 44)
                cornerRadius = dp(root, 16)
                insetTop = 0
                insetBottom = 0
                setIconResource(R.drawable.ic_notifications)
                iconSize = dp(root, 22)
                iconTint = ColorStateList.valueOf(color(root, R.color.hallo_navy))
                backgroundTintList = ColorStateList.valueOf(color(root, R.color.hallo_blue_soft))
                contentDescription = root.context.getString(R.string.notifications)
                setOnClickListener { root.findViewById<View>(R.id.navNotifications)?.performClick() }
            }, LinearLayout.LayoutParams(dp(root, 46), dp(root, 44)))

            row.addView(TextView(root.context).apply {
                tag = TAG_TOP_BADGE
                gravity = Gravity.CENTER
                textSize = 9f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.WHITE)
                background = rounded(color(root, R.color.hallo_danger), dp(root, 18))
                visibility = View.GONE
            }, LinearLayout.LayoutParams(dp(root, 20), dp(root, 20)).apply {
                marginStart = -dp(root, 14)
                topMargin = -dp(root, 18)
                marginEnd = dp(root, 3)
            })

            val languages = LinearLayout(root.context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.END
                setPadding(0, dp(root, 8), 0, 0)
            }
            languages.addView(languageMirror(root, "EN", R.id.languageEn), LinearLayout.LayoutParams(dp(root, 48), dp(root, 48)))
            languages.addView(languageMirror(root, "OR", R.id.languageOr), LinearLayout.LayoutParams(dp(root, 48), dp(root, 48)).apply { marginStart = dp(root, 6) })
            languages.addView(languageMirror(root, "አማ", R.id.languageAm), LinearLayout.LayoutParams(dp(root, 48), dp(root, 48)).apply { marginStart = dp(root, 6) })
            column.addView(row)
            column.addView(languages)
            addView(column)
        }.also { shell.addView(it, 0, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(root, 12) }) }

        if (chrome.parent === shell && shell.indexOfChild(chrome) != 0) {
            shell.removeView(chrome)
            shell.addView(chrome, 0)
        }

        val sourceBadge = root.findViewById<TextView>(R.id.notificationBadge)
        chrome.findViewWithTag<TextView>(TAG_TOP_BADGE)?.apply {
            text = sourceBadge?.text.orEmpty()
            visibility = if (sourceBadge?.visibility == View.VISIBLE && !sourceBadge.text.isNullOrBlank()) View.VISIBLE else View.GONE
        }
        updateLanguageMirror(root, chrome)
    }

    private fun languageMirror(root: View, label: String, targetId: Int) = MaterialButton(root.context).apply {
        tag = "customer-language-mirror-$targetId"
        text = label
        minWidth = 0
        minimumWidth = 0
        minHeight = dp(root, 48)
        setPadding(0, 0, 0, 0)
        maxLines = 1
        cornerRadius = dp(root, 13)
        insetTop = 0
        insetBottom = 0
        isAllCaps = false
        textSize = 9f
        strokeWidth = 1
        strokeColor = ColorStateList.valueOf(color(root, R.color.hallo_line))
        setOnClickListener { root.findViewById<View>(targetId)?.performClick() }
    }

    private fun updateLanguageMirror(root: View, chrome: View) {
        val checked = root.findViewById<com.google.android.material.button.MaterialButtonToggleGroup>(R.id.languageSelector)?.checkedButtonId
        listOf(R.id.languageEn, R.id.languageOr, R.id.languageAm).forEach { target ->
            chrome.findViewWithTag<MaterialButton>("customer-language-mirror-$target")?.apply {
                val active = checked == target
                backgroundTintList = ColorStateList.valueOf(color(root, if (active) R.color.hallo_blue else android.R.color.white))
                setTextColor(color(root, if (active) android.R.color.white else R.color.hallo_navy))
                strokeColor = ColorStateList.valueOf(color(root, if (active) R.color.hallo_blue else R.color.hallo_line))
            }
        }
    }

    private fun styleHome(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageHome) ?: return
        val hero = root.findViewById<MaterialCardView>(R.id.homeMapCard) ?: return
        val heroColumn = hero.getChildAt(0) as? LinearLayout ?: return
        val welcome = root.findViewById<TextView>(R.id.welcome) ?: return
        val welcomeRow = (welcome.parent as? View)?.parent as? View ?: return

        if (welcomeRow.parent !== heroColumn) {
            (welcomeRow.parent as? ViewGroup)?.removeView(welcomeRow)
            heroColumn.addView(welcomeRow, 0)
        }
        if (page.findViewWithTag<View>(TAG_HOME_ANCHOR) == null) {
            page.addView(View(root.context).apply { tag = TAG_HOME_ANCHOR }, 0, LinearLayout.LayoutParams(1, 0))
        }

        hero.radius = dp(root, 24).toFloat()
        hero.cardElevation = 0f
        hero.strokeWidth = 0
        heroColumn.background = gradient(color(root, R.color.hallo_blue), color(root, R.color.hallo_blue_dark), dp(root, 24))
        welcomeRow.background = ColorStateList.valueOf(Color.TRANSPARENT).let { android.graphics.drawable.ColorDrawable(Color.TRANSPARENT) }
        welcomeRow.setPadding(dp(root, 20), dp(root, 18), dp(root, 14), dp(root, 6))
        welcome.apply {
            setTextColor(Color.WHITE)
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
        }
        root.findViewById<TextView>(R.id.homeSummary)?.apply {
            setTextColor(Color.argb(225, 255, 255, 255))
            textSize = 13f
        }
        root.findViewById<MaterialButton>(R.id.refresh)?.apply {
            backgroundTintList = ColorStateList.valueOf(Color.argb(30, 255, 255, 255))
            iconTint = ColorStateList.valueOf(Color.WHITE)
        }

        root.findViewById<View>(R.id.homeMap)?.visibility = View.GONE
        heroColumn.findViewWithTag<ImageView>("approved-home-truck")?.apply {
            layoutParams = layoutParams.apply { height = dp(root, 150) }
            setPadding(dp(root, 26), dp(root, 2), dp(root, 26), dp(root, 2))
            background = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
        }
        val heroContent = heroColumn.getChildAt(heroColumn.childCount - 1)
        if (heroContent !== welcomeRow && heroContent.tag != TAG_HERO_TAGLINE) heroContent.visibility = View.GONE
        heroColumn.findViewWithTag<View>("approved-home-driver")?.visibility = View.GONE

        val tagline = heroColumn.findViewWithTag<TextView>(TAG_HERO_TAGLINE) ?: TextView(root.context).apply {
            tag = TAG_HERO_TAGLINE
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(root, 16), dp(root, 4), dp(root, 16), dp(root, 16))
            text = root.context.getString(R.string.dashboard_reliable_logistics)
        }.also { heroColumn.addView(it, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)) }
        tagline.text = root.context.getString(R.string.dashboard_reliable_logistics)

        page.findViewWithTag<View>("approved-home-quick-actions")?.visibility = View.GONE
        val quick = page.findViewWithTag<LinearLayout>(TAG_HOME_QUICK) ?: buildQuickActions(root).also { page.addView(it) }
        placeAfter(page, quick, hero)

        val metrics = page.findViewWithTag<LinearLayout>(TAG_HOME_METRICS) ?: buildMetrics(root).also { page.addView(it) }
        placeAfter(page, metrics, quick)
        updateMetrics(root, metrics)

        root.findViewById<View>(R.id.dashOrders)?.parent?.let { (it as? View)?.visibility = View.GONE }
        root.findViewById<View>(R.id.dashPayments)?.parent?.let { (it as? View)?.visibility = View.GONE }
        root.findViewById<View>(R.id.dashProfile)?.visibility = View.GONE
        root.findViewById<View>(R.id.dashNotifications)?.visibility = View.GONE
        root.findViewById<View>(R.id.dashAllOrders)?.let { button ->
            (button as? MaterialButton)?.apply {
                minHeight = dp(root, 52)
                cornerRadius = dp(root, 16)
                backgroundTintList = ColorStateList.valueOf(Color.WHITE)
                setTextColor(color(root, R.color.hallo_blue))
                strokeWidth = 1
                strokeColor = ColorStateList.valueOf(color(root, R.color.hallo_line))
            }
        }

        root.findViewById<LinearLayout>(R.id.dashRecentOrders)?.let { list ->
            for (i in 0 until list.childCount) {
                (list.getChildAt(i) as? MaterialCardView)?.apply {
                    radius = dp(root, 20).toFloat()
                    cardElevation = 0f
                    strokeWidth = 1
                    strokeColor = color(root, R.color.hallo_line)
                }
            }
        }

        val promo = page.findViewWithTag<MaterialCardView>(TAG_HOME_PROMO) ?: buildPromo(root).also { page.addView(it) }
        if (promo.parent !== page) page.addView(promo)
    }

    private fun buildQuickActions(root: View): LinearLayout = LinearLayout(root.context).apply {
        tag = TAG_HOME_QUICK
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(root, 14), 0, 0)
        addView(sectionLabel(root, root.context.getString(R.string.dash_quick_actions)))
        addView(LinearLayout(root.context).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(quickButton(root, R.drawable.ic_hallo_truck, R.string.book_truck, R.id.startBooking), weight(end = dp(root, 5)))
            addView(quickButton(root, R.drawable.ic_nav_track, R.string.nav_track, R.id.navTrack), weight(start = dp(root, 5)))
        })
        addView(LinearLayout(root.context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(root, 8), 0, 0)
            addView(quickButton(root, R.drawable.ic_nav_orders, R.string.nav_orders, R.id.navOrders), weight(end = dp(root, 5)))
            addView(quickButton(root, R.drawable.ic_nav_payments, R.string.nav_payments, R.id.navBook), weight(start = dp(root, 5)))
        })
    }

    private fun quickButton(root: View, icon: Int, label: Int, target: Int) = MaterialButton(root.context).apply {
        text = root.context.getString(label)
        setIconResource(icon)
        iconGravity = MaterialButton.ICON_GRAVITY_TEXT_TOP
        iconSize = dp(root, 24)
        iconPadding = dp(root, 7)
        iconTint = ColorStateList.valueOf(color(root, R.color.hallo_blue))
        gravity = Gravity.CENTER
        textSize = 12f
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = dp(root, 86)
        cornerRadius = dp(root, 18)
        insetTop = 0
        insetBottom = 0
        backgroundTintList = ColorStateList.valueOf(Color.WHITE)
        setTextColor(color(root, R.color.hallo_navy))
        strokeWidth = 1
        strokeColor = ColorStateList.valueOf(color(root, R.color.hallo_line))
        setOnClickListener { root.findViewById<View>(target)?.performClick() }
    }

    private fun buildMetrics(root: View): LinearLayout = LinearLayout(root.context).apply {
        tag = TAG_HOME_METRICS
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(root, 18), 0, dp(root, 2))
        addView(sectionLabel(root, root.context.getString(R.string.dash_overview)))
        addView(metricRow(root, "orders", R.string.metric_orders, "active", R.string.metric_active))
        addView(metricRow(root, "due", R.string.metric_to_pay, "delivered", R.string.metric_delivered).apply { setPadding(0, dp(root, 8), 0, 0) })
    }

    private fun metricRow(root: View, key1: String, label1: Int, key2: String, label2: Int) = LinearLayout(root.context).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(metricCard(root, key1, label1), weight(end = dp(root, 5)))
        addView(metricCard(root, key2, label2), weight(start = dp(root, 5)))
    }

    private fun metricCard(root: View, key: String, label: Int) = MaterialCardView(root.context).apply {
        radius = dp(root, 18).toFloat()
        cardElevation = 0f
        strokeWidth = 1
        strokeColor = color(root, R.color.hallo_line)
        setCardBackgroundColor(Color.WHITE)
        val content = LinearLayout(root.context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(root, 14), dp(root, 13), dp(root, 14), dp(root, 13))
            addView(TextView(root.context).apply {
                text = root.context.getString(label).uppercase()
                textSize = 10f
                letterSpacing = 0.05f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(color(root, R.color.hallo_muted))
            })
            addView(TextView(root.context).apply {
                tag = "customer-metric-$key"
                text = "—"
                textSize = if (key == "due") 16f else 22f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(color(root, R.color.hallo_navy))
                setPadding(0, dp(root, 5), 0, 0)
            })
        }
        addView(content)
    }

    internal fun updateMetrics(root: View, metrics: View, state: CustomerUiState? = state(root)) {
        if (state == null || state.loading || !state.authorized) {
            listOf("orders", "active", "due", "delivered").forEach { key ->
                metrics.findViewWithTag<TextView>("customer-metric-$key")?.text = "—"
            }
            return
        }
        val active = state.orders.count { CustomerPolicy.showAssignment(it.status) }
        val delivered = state.orders.count { it.status == "delivered" }
        val due = state.orders.filterNot { it.status == "cancelled" }.sumOf { order ->
            CustomerPaymentPolicy.summarize(order, state.payments.filter { it.orderId == order.id }).remainingToSubmit
        }
        metrics.findViewWithTag<TextView>("customer-metric-orders")?.text = state.orders.size.toString()
        metrics.findViewWithTag<TextView>("customer-metric-active")?.text = active.toString()
        metrics.findViewWithTag<TextView>("customer-metric-due")?.text = "ETB ${NumberFormat.getIntegerInstance(root.resources.configuration.locales[0]).format(due)}"
        metrics.findViewWithTag<TextView>("customer-metric-delivered")?.text = delivered.toString()
    }

    private fun buildPromo(root: View) = MaterialCardView(root.context).apply {
        tag = TAG_HOME_PROMO
        radius = dp(root, 22).toFloat()
        cardElevation = 0f
        strokeWidth = 0
        setCardBackgroundColor(color(root, R.color.hallo_blue_soft))
        val content = LinearLayout(root.context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(root, 18), dp(root, 18), dp(root, 18), dp(root, 18))
            addView(TextView(root.context).apply {
                text = root.context.getString(R.string.dash_promo_title)
                gravity = Gravity.CENTER
                textSize = 18f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(color(root, R.color.hallo_navy))
            })
            addView(TextView(root.context).apply {
                text = root.context.getString(R.string.dash_promo_subtitle)
                gravity = Gravity.CENTER
                textSize = 12f
                setTextColor(color(root, R.color.hallo_blue))
                setPadding(0, dp(root, 5), 0, 0)
            })
        }
        addView(content)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(root, 16)
            bottomMargin = dp(root, 6)
        }
    }

    private fun styleBooking(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageBook) ?: return
        page.findViewWithTag<View>("approved-book-brand")?.visibility = View.GONE
        ensureBookingHeader(root, page)
        ensureBookingStepper(root, page)

        val map = root.findViewById<View>(R.id.bookingMap)
        map?.layoutParams = map?.layoutParams?.apply { height = dp(root, 300) }
        findAncestorCard(map)?.apply {
            radius = dp(root, 24).toFloat()
            cardElevation = 0f
            strokeWidth = 0
        }

        val routeCard = findAncestorCard(root.findViewById(R.id.pickupLayout))
        val cargoCard = findAncestorCard(root.findViewById(R.id.cargoCategoryLayout))
        val truckCard = findAncestorCard(root.findViewById(R.id.truckOptions))
        val quoteCard = findAncestorCard(root.findViewById(R.id.quoteResult))

        if (cargoCard != null && truckCard != null && cargoCard.parent === page && truckCard.parent === page) {
            val cargoIndex = page.indexOfChild(cargoCard)
            val truckIndex = page.indexOfChild(truckCard)
            if (cargoIndex > truckIndex) {
                page.removeView(cargoCard)
                page.addView(cargoCard, truckIndex)
            }
        }

        listOfNotNull(routeCard, cargoCard, truckCard).forEach { card ->
            card.radius = dp(root, 20).toFloat()
            card.cardElevation = 0f
            card.strokeWidth = 1
            card.strokeColor = color(root, R.color.hallo_line)
            card.setCardBackgroundColor(Color.WHITE)
        }
        quoteCard?.apply {
            radius = dp(root, 20).toFloat()
            cardElevation = 0f
            strokeWidth = 1
            strokeColor = color(root, R.color.hallo_blue)
            setCardBackgroundColor(color(root, R.color.hallo_blue_soft))
        }

        routeCard?.let { ensureRouteHeader(root, it) }
        root.findViewById<TextView>(R.id.cargoSectionTitle)?.text = root.context.getString(R.string.booking_progress_cargo)
        root.findViewById<TextView>(R.id.truckSectionTitle)?.text = root.context.getString(R.string.booking_progress_truck)
        root.findViewById<TextView>(R.id.quoteSectionTitle)?.text = root.context.getString(R.string.booking_progress_quote)

        root.findViewById<MaterialButton>(R.id.calculateQuote)?.primary(root)
        root.findViewById<MaterialButton>(R.id.createOrder)?.primary(root)
        root.findViewById<TextView>(R.id.quoteResult)?.apply {
            setTextColor(color(root, R.color.hallo_navy))
            textSize = 16f
            setLineSpacing(dp(root, 4).toFloat(), 1.05f)
        }

        val trucks = root.findViewById<LinearLayout>(R.id.truckOptions)
        if (trucks != null) {
            for (i in 0 until trucks.childCount) {
                (trucks.getChildAt(i) as? MaterialCardView)?.apply {
                    radius = dp(root, 18).toFloat()
                    cardElevation = 0f
                    val selected = strokeWidth > 1
                    strokeWidth = if (selected) dp(root, 2) else 1
                    strokeColor = color(root, if (selected) R.color.hallo_blue else R.color.hallo_line)
                    setCardBackgroundColor(color(root, if (selected) R.color.hallo_blue_soft else android.R.color.white))
                }
            }
        }
        updateBookingStepper(root)
    }

    private fun ensureBookingHeader(root: View, page: LinearLayout) {
        val header = page.findViewWithTag<MaterialCardView>(TAG_BOOK_HEADER) ?: MaterialCardView(root.context).apply {
            tag = TAG_BOOK_HEADER
            radius = dp(root, 22).toFloat()
            cardElevation = 0f
            strokeWidth = 0
            setCardBackgroundColor(color(root, R.color.hallo_navy))
            val content = LinearLayout(root.context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(root, 18), dp(root, 16), dp(root, 18), dp(root, 16))
                addView(TextView(root.context).apply {
                    text = root.context.getString(R.string.book_truck)
                    textSize = 22f
                    setTypeface(typeface, Typeface.BOLD)
                    setTextColor(Color.WHITE)
                })
                addView(TextView(root.context).apply {
                    text = root.context.getString(R.string.booking_progress_summary)
                    textSize = 12f
                    setTextColor(Color.argb(220, 255, 255, 255))
                    setPadding(0, dp(root, 4), 0, 0)
                })
            }
            addView(content)
        }.also { page.addView(it, 0, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(root, 10) }) }
        if (header.parent === page && page.indexOfChild(header) != 0) {
            page.removeView(header)
            page.addView(header, 0)
        }
    }

    private fun ensureBookingStepper(root: View, page: LinearLayout) {
        val stepper = page.findViewWithTag<LinearLayout>(TAG_BOOK_STEPPER) ?: LinearLayout(root.context).apply {
            tag = TAG_BOOK_STEPPER
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(root, 10))
            val labels = listOf(
                R.string.booking_progress_route,
                R.string.booking_progress_cargo,
                R.string.booking_progress_truck,
                R.string.booking_progress_quote,
            )
            labels.forEachIndexed { index, label ->
                addView(TextView(root.context).apply {
                    tag = "customer-book-step-${index + 1}"
                    gravity = Gravity.CENTER
                    textSize = 10f
                    setTypeface(typeface, Typeface.BOLD)
                    setPadding(dp(root, 6), dp(root, 7), dp(root, 6), dp(root, 7))
                    text = "${index + 1} ${root.context.getString(label)}"
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginStart = if (index == 0) 0 else dp(root, 3)
                    marginEnd = if (index == labels.lastIndex) 0 else dp(root, 3)
                })
            }
        }.also { page.addView(it, 1) }
        if (stepper.parent === page && page.indexOfChild(stepper) != 1) {
            page.removeView(stepper)
            page.addView(stepper, 1)
        }
    }

    private fun updateBookingStepper(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageBook) ?: return
        val state = state(root)
        val quantity = (root.findViewById<TextView>(R.id.cargoQuantity)?.text?.toString()?.toDoubleOrNull() ?: 0.0)
        val active = when {
            state?.route == null -> 1
            quantity <= 0.0 -> 2
            state.quote == null -> 3
            else -> 4
        }
        val labels = listOf(
            R.string.booking_progress_route,
            R.string.booking_progress_cargo,
            R.string.booking_progress_truck,
            R.string.booking_progress_quote,
        )
        labels.forEachIndexed { index, label ->
            page.findViewWithTag<TextView>("customer-book-step-${index + 1}")?.apply {
                val step = index + 1
                val completed = step < active
                val selected = step == active
                text = "${if (completed) "✓" else step} ${root.context.getString(label)}"
                background = rounded(
                    color(root, when {
                        selected -> R.color.hallo_blue
                        completed -> R.color.hallo_blue_soft
                        else -> android.R.color.white
                    }),
                    dp(root, 14),
                )
                setTextColor(color(root, when {
                    selected -> android.R.color.white
                    completed -> R.color.hallo_blue
                    else -> R.color.hallo_muted
                }))
            }
        }
    }

    private fun ensureRouteHeader(root: View, card: MaterialCardView) {
        val content = card.getChildAt(0) as? LinearLayout ?: return
        if (content.findViewWithTag<View>(TAG_BOOK_ROUTE_HEADER) != null) return
        content.addView(TextView(root.context).apply {
            tag = TAG_BOOK_ROUTE_HEADER
            text = root.context.getString(R.string.booking_progress_route)
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(color(root, R.color.hallo_navy))
        }, 0)
    }

    private fun styleOrders(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageOrders) ?: return
        root.findViewById<TextView>(R.id.ordersTitle)?.pageTitle(root)
        root.findViewById<TextView>(R.id.ordersSubtitle)?.pageSubtitle(root)
        val list = root.findViewById<LinearLayout>(R.id.ordersList) ?: return
        styleGeneratedCards(root, list)
    }

    private fun stylePayments(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pagePayments) ?: return
        (page.getChildAt(0) as? TextView)?.pageTitle(root)
        (page.getChildAt(1) as? TextView)?.pageSubtitle(root)
        root.findViewById<LinearLayout>(R.id.paymentsList)?.let { styleGeneratedCards(root, it) }
    }

    private fun styleGeneratedCards(root: View, parent: ViewGroup) {
        for (i in 0 until parent.childCount) {
            val child = parent.getChildAt(i)
            if (child is MaterialCardView) {
                child.radius = dp(root, 20).toFloat()
                child.cardElevation = 0f
                child.strokeWidth = 1
                child.strokeColor = color(root, R.color.hallo_line)
                child.setCardBackgroundColor(Color.WHITE)
            }
            if (child is ViewGroup) styleGeneratedCards(root, child)
            if (child is MaterialButton) {
                child.cornerRadius = dp(root, 15)
                child.minHeight = dp(root, 48)
            }
        }
    }

    private fun styleTracking(root: View) {
        root.findViewById<TextView>(R.id.trackingTitle)?.apply {
            background = gradient(color(root, R.color.hallo_blue), color(root, R.color.hallo_blue_dark), dp(root, 22))
            setTextColor(Color.WHITE)
        }
        root.findViewById<MaterialButton>(R.id.refreshTracking)?.apply {
            cornerRadius = dp(root, 16)
            strokeWidth = 1
            strokeColor = ColorStateList.valueOf(color(root, R.color.hallo_line))
            backgroundTintList = ColorStateList.valueOf(Color.WHITE)
            setTextColor(color(root, R.color.hallo_blue))
            iconTint = ColorStateList.valueOf(color(root, R.color.hallo_blue))
        }
    }

    private fun styleProfile(root: View) {
        root.findViewById<TextView>(R.id.profileTitle)?.apply {
            background = gradient(color(root, R.color.hallo_blue), color(root, R.color.hallo_blue_dark), dp(root, 22))
            setTextColor(Color.WHITE)
        }
        root.findViewById<MaterialButton>(R.id.signOut)?.apply {
            cornerRadius = dp(root, 16)
            backgroundTintList = ColorStateList.valueOf(Color.rgb(255, 239, 239))
            setTextColor(color(root, R.color.hallo_danger))
        }
    }

    private fun renderSuccessState(root: View) {
        val state = state(root) ?: return
        val match = Regex("^Order (.+) created$").matchEntire(state.message)
        val tracking = match?.groupValues?.getOrNull(1)
        val page = root.findViewById<LinearLayout>(R.id.pageOrders) ?: return
        val list = root.findViewById<View>(R.id.ordersList)
        val title = root.findViewById<View>(R.id.ordersTitle)
        val subtitle = root.findViewById<View>(R.id.ordersSubtitle)
        val card = page.findViewWithTag<MaterialCardView>(TAG_SUCCESS)

        if (tracking == null || dismissedSuccess[root] == tracking || state.page != CustomerPage.ORDERS) {
            card?.visibility = View.GONE
            title?.visibility = View.VISIBLE
            subtitle?.visibility = View.VISIBLE
            list?.visibility = View.VISIBLE
            return
        }

        val success = card ?: buildSuccessCard(root).also { page.addView(it, 0) }
        success.findViewWithTag<TextView>(TAG_SUCCESS_TRACKING)?.text = tracking
        success.visibility = View.VISIBLE
        title?.visibility = View.GONE
        subtitle?.visibility = View.GONE
        list?.visibility = View.GONE
    }

    private fun buildSuccessCard(root: View) = MaterialCardView(root.context).apply {
        tag = TAG_SUCCESS
        radius = dp(root, 26).toFloat()
        cardElevation = 0f
        strokeWidth = 1
        strokeColor = color(root, R.color.hallo_line)
        setCardBackgroundColor(Color.WHITE)
        val content = LinearLayout(root.context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(root, 22), dp(root, 28), dp(root, 22), dp(root, 24))
            addView(TextView(root.context).apply {
                text = "✓"
                gravity = Gravity.CENTER
                textSize = 34f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(color(root, R.color.hallo_success))
                background = rounded(color(root, R.color.hallo_success_soft), dp(root, 42))
            }, LinearLayout.LayoutParams(dp(root, 76), dp(root, 76)))
            addView(TextView(root.context).apply {
                text = root.context.getString(R.string.booking_success_title)
                gravity = Gravity.CENTER
                textSize = 24f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(color(root, R.color.hallo_navy))
                setPadding(0, dp(root, 16), 0, 0)
            })
            addView(TextView(root.context).apply {
                text = root.context.getString(R.string.booking_success_body)
                gravity = Gravity.CENTER
                textSize = 14f
                setTextColor(color(root, R.color.hallo_muted))
                setPadding(0, dp(root, 5), 0, 0)
            })
            addView(TextView(root.context).apply {
                tag = TAG_SUCCESS_TRACKING
                gravity = Gravity.CENTER
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(color(root, R.color.hallo_blue))
                setPadding(0, dp(root, 16), 0, dp(root, 12))
            })
            addView(MaterialButton(root.context).apply {
                text = root.context.getString(R.string.booking_view_orders)
                isAllCaps = false
                minHeight = dp(root, 54)
                cornerRadius = dp(root, 16)
                backgroundTintList = ColorStateList.valueOf(color(root, R.color.hallo_blue))
                setTextColor(Color.WHITE)
                setOnClickListener {
                    val tracking = findViewWithTag<TextView>(TAG_SUCCESS_TRACKING)?.text?.toString().orEmpty()
                    dismissedSuccess[root] = tracking
                    visibility = View.GONE
                    root.findViewById<View>(R.id.ordersTitle)?.visibility = View.VISIBLE
                    root.findViewById<View>(R.id.ordersSubtitle)?.visibility = View.VISIBLE
                    root.findViewById<View>(R.id.ordersList)?.visibility = View.VISIBLE
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(MaterialButton(root.context).apply {
                text = root.context.getString(R.string.booking_create_another)
                isAllCaps = false
                minHeight = dp(root, 52)
                cornerRadius = dp(root, 16)
                backgroundTintList = ColorStateList.valueOf(Color.WHITE)
                setTextColor(color(root, R.color.hallo_blue))
                strokeWidth = 1
                strokeColor = ColorStateList.valueOf(color(root, R.color.hallo_blue))
                setOnClickListener {
                    val tracking = findViewWithTag<TextView>(TAG_SUCCESS_TRACKING)?.text?.toString().orEmpty()
                    dismissedSuccess[root] = tracking
                    root.findViewById<View>(R.id.startBooking)?.performClick()
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(root, 8) })
        }
        addView(content)
    }

    private fun sectionLabel(root: View, value: String) = TextView(root.context).apply {
        text = value
        textSize = 18f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(color(root, R.color.hallo_navy))
        setPadding(0, 0, 0, dp(root, 8))
    }

    private fun TextView.pageTitle(root: View) {
        textSize = 26f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(color(root, R.color.hallo_navy))
    }

    private fun TextView.pageSubtitle(root: View) {
        textSize = 13f
        setTextColor(color(root, R.color.hallo_muted))
    }

    private fun MaterialButton.primary(root: View) {
        minHeight = dp(root, 54)
        cornerRadius = dp(root, 16)
        insetTop = 0
        insetBottom = 0
        backgroundTintList = ColorStateList.valueOf(color(root, R.color.hallo_blue))
        setTextColor(Color.WHITE)
        iconTint = ColorStateList.valueOf(Color.WHITE)
        strokeWidth = 0
    }

    private fun state(root: View): CustomerUiState? {
        val owner = root.findViewTreeViewModelStoreOwner() ?: return null
        return ViewModelProvider(owner)[CustomerViewModel::class.java].state.value
    }

    private fun placeAfter(parent: LinearLayout, child: View, anchor: View) {
        val target = parent.indexOfChild(anchor).takeIf { it >= 0 }?.plus(1) ?: return
        val current = parent.indexOfChild(child)
        if (child.parent !== parent) {
            (child.parent as? ViewGroup)?.removeView(child)
            parent.addView(child, target)
        } else if (current != target) {
            parent.removeView(child)
            parent.addView(child, target.coerceAtMost(parent.childCount))
        }
    }

    private fun findAncestorCard(view: View?): MaterialCardView? {
        var node = view?.parent
        while (node is View) {
            if (node is MaterialCardView) return node
            node = node.parent
        }
        return null
    }

    private fun weight(start: Int = 0, end: Int = 0) = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = start
        marginEnd = end
    }

    private fun color(root: View, id: Int): Int = root.context.getColor(id)

    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(color)
        cornerRadius = radius.toFloat()
    }

    private fun gradient(start: Int, end: Int, radius: Int) = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
        cornerRadius = radius.toFloat()
    }

    private fun dp(root: View, value: Int): Int = (value * root.resources.displayMetrics.density).toInt()
}
