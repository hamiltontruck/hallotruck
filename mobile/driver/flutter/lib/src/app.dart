import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'backend.dart';
import 'core.dart';

class HalloDriverConfigErrorApp extends StatelessWidget {
  const HalloDriverConfigErrorApp({super.key});

  @override
  Widget build(BuildContext context) {
    const strings = DriverStrings(DriverLanguage.en);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: _theme(),
      home: Scaffold(
        backgroundColor: halloSurface,
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: _HalloCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.local_shipping_rounded, size: 48, color: halloBlue),
                      const SizedBox(height: 16),
                      Text(strings.text('configError'), style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 8),
                      Text(strings.text('configHint'), textAlign: TextAlign.center),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HalloDriverApp extends StatefulWidget {
  const HalloDriverApp({super.key});

  @override
  State<HalloDriverApp> createState() => _HalloDriverAppState();
}

class _HalloDriverAppState extends State<HalloDriverApp> {
  late final DriverController controller;

  @override
  void initState() {
    super.initState();
    controller = DriverController();
    unawaited(controller.initialize());
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'HALLO Driver',
          theme: _theme(),
          home: !controller.initialized
              ? const _SplashScreen()
              : controller.profile == null
                  ? _AuthScreen(controller: controller)
                  : _DriverShell(controller: controller),
        );
      },
    );
  }
}

ThemeData _theme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: halloBlue,
    brightness: Brightness.light,
    primary: halloBlue,
    secondary: halloGold,
    surface: Colors.white,
    error: halloDanger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: halloSurface,
    fontFamily: 'sans-serif',
    appBarTheme: const AppBarTheme(
      backgroundColor: halloNavy,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
        side: BorderSide(color: Color(0xFFE3E9F2)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFD6DEEA)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFD6DEEA)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: halloBlue, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
  );
}

class DriverController extends ChangeNotifier {
  DriverController({DriverBackend? backend}) : _backend = backend ?? DriverBackend();

  static const _languageKey = 'hallo_driver_language_v1';
  final DriverBackend _backend;
  final SharedPreferencesAsync _prefs = SharedPreferencesAsync();

  bool initialized = false;
  bool busy = false;
  String? error;
  String? notice;
  DriverLanguage language = DriverLanguage.en;
  DriverProfile? profile;
  List<DriverJob> jobs = const [];
  DriverJob? activeTrip;
  LiveTripSnapshot? liveTrip;
  int selectedIndex = 0;

  DriverStrings get strings => DriverStrings(language);

  Future<void> initialize() async {
    final saved = await _prefs.getString(_languageKey);
    language = switch (saved) {
      'or' => DriverLanguage.or,
      'am' => DriverLanguage.am,
      _ => DriverLanguage.en,
    };

    if (_backend.currentUser != null) {
      await refreshAll();
    }
    initialized = true;
    notifyListeners();
  }

  Future<void> setLanguage(DriverLanguage next) async {
    language = next;
    await _prefs.setString(_languageKey, next.name);
    notifyListeners();
  }

  void selectTab(int index) {
    selectedIndex = index;
    notifyListeners();
    if (index == 1) unawaited(refreshJobs());
    if (index == 2) unawaited(refreshTrip());
  }

  Future<void> signIn(String email, String pin) async {
    await _run(() async {
      await _backend.signIn(email: email, pin: pin);
      await refreshAll(emitBusy: false);
    });
  }

  Future<void> signUp(String name, String phone, String email, String pin) async {
    await _run(() async {
      await _backend.signUp(name: name, phone: phone, email: email, pin: pin);
      notice = strings.text('registered');
      if (_backend.currentUser != null) await refreshAll(emitBusy: false);
    });
  }

  Future<void> signOut() async {
    await _run(() async {
      await _backend.signOut();
      profile = null;
      jobs = const [];
      activeTrip = null;
      liveTrip = null;
      selectedIndex = 0;
    });
  }

  Future<void> refreshAll({bool emitBusy = true}) async {
    if (emitBusy) {
      busy = true;
      notifyListeners();
    }
    error = null;
    try {
      profile = await _backend.profile();
      jobs = await _backend.availableJobs();
      activeTrip = await _backend.activeTrip();
      liveTrip = activeTrip == null ? null : await _backend.liveTrip(activeTrip!.id);
    } catch (e) {
      error = _messageFor(e);
      if (_backend.currentUser == null) profile = null;
    } finally {
      if (emitBusy) busy = false;
      notifyListeners();
    }
  }

  Future<void> refreshJobs() async {
    try {
      jobs = await _backend.availableJobs();
      error = null;
    } catch (e) {
      error = _messageFor(e);
    }
    notifyListeners();
  }

  Future<void> refreshTrip({bool silent = false}) async {
    if (!silent) {
      busy = true;
      notifyListeners();
    }
    try {
      activeTrip = await _backend.activeTrip();
      liveTrip = activeTrip == null ? null : await _backend.liveTrip(activeTrip!.id);
      error = null;
    } catch (e) {
      error = _messageFor(e);
    } finally {
      if (!silent) busy = false;
      notifyListeners();
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    busy = true;
    error = null;
    notice = null;
    notifyListeners();
    try {
      await action();
    } catch (e) {
      error = _messageFor(e);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  String _messageFor(Object errorValue) {
    if (errorValue is FormatException) {
      return switch (errorValue.message) {
        'invalid_name' => strings.text('invalidName'),
        'invalid_phone' => strings.text('invalidPhone'),
        'invalid_email' => strings.text('invalidEmail'),
        'invalid_pin' => strings.text('invalidPin'),
        _ => errorValue.message,
      };
    }
    return errorValue.toString().replaceFirst('Exception: ', '');
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: halloNavy,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.local_shipping_rounded, color: halloGold, size: 58),
            SizedBox(height: 16),
            Text('HALLO DRIVER', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
            SizedBox(height: 20),
            CircularProgressIndicator(color: halloGold),
          ],
        ),
      ),
    );
  }
}

class _AuthScreen extends StatefulWidget {
  const _AuthScreen({required this.controller});

  final DriverController controller;

  @override
  State<_AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<_AuthScreen> {
  final name = TextEditingController();
  final phone = TextEditingController();
  final email = TextEditingController();
  final pin = TextEditingController();
  bool register = false;
  bool obscure = true;

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    pin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final s = c.strings;
    return Scaffold(
      backgroundColor: halloSurface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const _BrandMark(),
                      const Spacer(),
                      _LanguageMenu(controller: c),
                    ],
                  ),
                  const SizedBox(height: 28),
                  Text(
                    register ? s.text('register') : s.text('login'),
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: halloNavy),
                  ),
                  const SizedBox(height: 8),
                  Text('Secure driver access · Supabase session · HALLO logistics', style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 24),
                  _HalloCard(
                    child: Column(
                      children: [
                        if (register) ...[
                          TextField(
                            controller: name,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.words,
                            autofillHints: const [AutofillHints.name],
                            decoration: InputDecoration(labelText: s.text('fullName'), prefixIcon: const Icon(Icons.person_outline_rounded)),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: phone,
                            keyboardType: TextInputType.phone,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.telephoneNumber],
                            decoration: InputDecoration(labelText: s.text('phone'), hintText: '+2519XXXXXXXX / 09XXXXXXXX', prefixIcon: const Icon(Icons.phone_outlined)),
                          ),
                          const SizedBox(height: 14),
                        ],
                        TextField(
                          controller: email,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          autofillHints: const [AutofillHints.email],
                          decoration: InputDecoration(labelText: s.text('email'), prefixIcon: const Icon(Icons.alternate_email_rounded)),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: pin,
                          keyboardType: TextInputType.number,
                          obscureText: obscure,
                          maxLength: 6,
                          textInputAction: TextInputAction.done,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                          autofillHints: const [AutofillHints.password],
                          onSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: s.text('pin'),
                            counterText: '',
                            prefixIcon: const Icon(Icons.lock_outline_rounded),
                            suffixIcon: IconButton(
                              tooltip: obscure ? 'Show PIN' : 'Hide PIN',
                              onPressed: () => setState(() => obscure = !obscure),
                              icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                            ),
                          ),
                        ),
                        if (c.error != null) ...[
                          const SizedBox(height: 14),
                          _MessageBanner(text: c.error!, error: true),
                        ],
                        if (c.notice != null) ...[
                          const SizedBox(height: 14),
                          _MessageBanner(text: c.notice!, error: false),
                        ],
                        const SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: FilledButton.icon(
                            onPressed: c.busy ? null : _submit,
                            icon: c.busy
                                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : Icon(register ? Icons.person_add_alt_1_rounded : Icons.login_rounded),
                            label: Text(register ? s.text('register') : s.text('login')),
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: c.busy
                              ? null
                              : () => setState(() {
                                    register = !register;
                                    c.error = null;
                                    c.notice = null;
                                  }),
                          child: Text(register ? s.text('login') : s.text('register')),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    final c = widget.controller;
    if (register) {
      unawaited(c.signUp(name.text, phone.text, email.text, pin.text));
    } else {
      unawaited(c.signIn(email.text, pin.text));
    }
  }
}

class _DriverShell extends StatelessWidget {
  const _DriverShell({required this.controller});

  final DriverController controller;

  @override
  Widget build(BuildContext context) {
    final s = controller.strings;
    final pages = [
      _HomeScreen(controller: controller),
      _JobsScreen(controller: controller),
      _TripScreen(controller: controller),
      _PlaceholderScreen(icon: Icons.account_balance_wallet_outlined, text: s.text('nextSlice')),
      _ProfileScreen(controller: controller),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const _BrandMark(compact: true),
        actions: [
          if (controller.busy)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Center(child: SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: halloGold))),
            ),
          _LanguageMenu(controller: controller, dark: true),
          IconButton(
            tooltip: s.text('refresh'),
            onPressed: controller.busy ? null : () => unawaited(controller.refreshAll()),
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          if (controller.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: _MessageBanner(text: controller.error!, error: true),
            ),
          Expanded(child: IndexedStack(index: controller.selectedIndex, children: pages)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: controller.selectedIndex,
        onDestinationSelected: controller.selectTab,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: s.text('home')),
          NavigationDestination(icon: const Icon(Icons.work_outline_rounded), selectedIcon: const Icon(Icons.work_rounded), label: s.text('jobs')),
          NavigationDestination(icon: const Icon(Icons.route_outlined), selectedIcon: const Icon(Icons.route_rounded), label: s.text('trip')),
          NavigationDestination(icon: const Icon(Icons.account_balance_wallet_outlined), selectedIcon: const Icon(Icons.account_balance_wallet_rounded), label: s.text('wallet')),
          NavigationDestination(icon: const Icon(Icons.person_outline_rounded), selectedIcon: const Icon(Icons.person_rounded), label: s.text('profile')),
        ],
      ),
    );
  }
}

class _HomeScreen extends StatelessWidget {
  const _HomeScreen({required this.controller});

  final DriverController controller;

  @override
  Widget build(BuildContext context) {
    final s = controller.strings;
    final profile = controller.profile!;
    return RefreshIndicator(
      onRefresh: controller.refreshAll,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            '${s.text('appName')} · ${profile.fullName?.trim().isNotEmpty == true ? profile.fullName : profile.phone ?? ''}',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: halloNavy),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (profile.status != null) _StatusChip(label: profile.status!.replaceAll('_', ' '), color: halloBlue),
              if (profile.rating != null) _StatusChip(label: '★ ${profile.rating!.toStringAsFixed(1)}', color: halloGold, darkText: true),
            ],
          ),
          const SizedBox(height: 18),
          LayoutBuilder(
            builder: (context, constraints) {
              final stacked = constraints.maxWidth < 520;
              final cards = [
                _MetricCard(
                  icon: Icons.work_outline_rounded,
                  title: s.text('availableJobs'),
                  value: '${controller.jobs.length}',
                  onTap: () => controller.selectTab(1),
                ),
                _MetricCard(
                  icon: Icons.route_rounded,
                  title: s.text('activeTrip'),
                  value: controller.activeTrip?.trackingId ?? (controller.activeTrip == null ? '—' : controller.activeTrip!.id),
                  onTap: () => controller.selectTab(2),
                ),
              ];
              return stacked
                  ? Column(children: [cards[0], const SizedBox(height: 12), cards[1]])
                  : Row(children: [Expanded(child: cards[0]), const SizedBox(width: 12), Expanded(child: cards[1])]);
            },
          ),
          const SizedBox(height: 18),
          if (controller.activeTrip != null)
            _JobCard(job: controller.activeTrip!, strings: s, active: true, onTap: () => controller.selectTab(2))
          else
            _HalloCard(
              child: Row(
                children: [
                  const Icon(Icons.check_circle_outline_rounded, color: halloSuccess),
                  const SizedBox(width: 12),
                  Expanded(child: Text(s.text('noTrip'))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _JobsScreen extends StatelessWidget {
  const _JobsScreen({required this.controller});

  final DriverController controller;

  @override
  Widget build(BuildContext context) {
    final s = controller.strings;
    return RefreshIndicator(
      onRefresh: controller.refreshJobs,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Text(s.text('availableJobs'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: halloNavy)),
          const SizedBox(height: 6),
          Text(s.text('jobsRule')),
          const SizedBox(height: 16),
          if (controller.jobs.isEmpty)
            _HalloCard(child: Text(s.text('noJobs')))
          else
            ...controller.jobs.map((job) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _JobCard(job: job, strings: s),
                )),
        ],
      ),
    );
  }
}

class _TripScreen extends StatefulWidget {
  const _TripScreen({required this.controller});

  final DriverController controller;

  @override
  State<_TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<_TripScreen> {
  Timer? timer;

  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (widget.controller.selectedIndex == 2 && widget.controller.profile != null) {
        unawaited(widget.controller.refreshTrip(silent: true));
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final s = c.strings;
    final trip = c.activeTrip;
    if (trip == null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [_HalloCard(child: Text(s.text('noTrip')))],
      );
    }

    final freshness = DriverValidators.freshness(c.liveTrip?.recordedAt);
    final status = switch (freshness) {
      TrackingFreshness.live => s.text('live'),
      TrackingFreshness.stale => s.text('stale'),
      TrackingFreshness.offline => s.text('offline'),
    };
    final statusColor = switch (freshness) {
      TrackingFreshness.live => halloSuccess,
      TrackingFreshness.stale => halloWarning,
      TrackingFreshness.offline => halloDanger,
    };

    return RefreshIndicator(
      onRefresh: c.refreshTrip,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.text('activeTrip'), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: halloNavy)),
                    const SizedBox(height: 4),
                    Text(trip.trackingId ?? trip.id),
                  ],
                ),
              ),
              _StatusChip(label: status, color: statusColor),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: MediaQuery.sizeOf(context).width < 380 ? 310 : 380,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: _LiveMap(snapshot: c.liveTrip, strings: s),
            ),
          ),
          const SizedBox(height: 14),
          _JobCard(job: trip, strings: s, active: true),
          const SizedBox(height: 12),
          _HalloCard(
            child: Wrap(
              spacing: 18,
              runSpacing: 12,
              children: [
                _InfoValue(label: s.text('lastUpdate'), value: _time(c.liveTrip?.recordedAt)),
                _InfoValue(label: s.text('speed'), value: c.liveTrip?.speedKmh == null ? '—' : '${c.liveTrip!.speedKmh!.toStringAsFixed(0)} km/h'),
                _InfoValue(label: s.text('heading'), value: c.liveTrip?.heading == null ? '—' : '${c.liveTrip!.heading!.toStringAsFixed(0)}°'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _time(DateTime? value) {
    if (value == null) return '—';
    final local = value.toLocal();
    String p(int n) => n.toString().padLeft(2, '0');
    return '${p(local.hour)}:${p(local.minute)}:${p(local.second)}';
  }
}

class _LiveMap extends StatelessWidget {
  const _LiveMap({required this.snapshot, required this.strings});

  final LiveTripSnapshot? snapshot;
  final DriverStrings strings;

  LatLng? _point(double? lat, double? lng) {
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return LatLng(lat, lng);
  }

  @override
  Widget build(BuildContext context) {
    final truck = _point(snapshot?.truckLat, snapshot?.truckLng);
    final pickup = _point(snapshot?.pickupLat, snapshot?.pickupLng);
    final dropoff = _point(snapshot?.dropoffLat, snapshot?.dropoffLng);
    final center = truck ?? pickup ?? dropoff;

    if (center == null) {
      return ColoredBox(
        color: const Color(0xFFE8EEF7),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.gps_not_fixed_rounded, size: 42, color: halloNavy),
                const SizedBox(height: 12),
                Text(strings.text('waitingGps'), textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      );
    }

    final markers = <Marker>[
      if (pickup != null)
        Marker(
          point: pickup,
          width: 42,
          height: 42,
          child: const _MapMarker(icon: Icons.trip_origin_rounded, color: halloNavy),
        ),
      if (dropoff != null)
        Marker(
          point: dropoff,
          width: 42,
          height: 42,
          child: const _MapMarker(icon: Icons.flag_rounded, color: halloGold, darkIcon: true),
        ),
      if (truck != null)
        Marker(
          point: truck,
          width: 48,
          height: 48,
          child: const _MapMarker(icon: Icons.local_shipping_rounded, color: halloSuccess),
        ),
    ];

    return Stack(
      fit: StackFit.expand,
      children: [
        FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: 13),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.hallo.logistics.driver',
            ),
            MarkerLayer(markers: markers),
          ],
        ),
        Positioned(
          right: 8,
          bottom: 6,
          child: DecoratedBox(
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.88), borderRadius: BorderRadius.circular(8)),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              child: Text('© OpenStreetMap contributors', style: TextStyle(fontSize: 9, color: halloNavy)),
            ),
          ),
        ),
      ],
    );
  }
}

class _MapMarker extends StatelessWidget {
  const _MapMarker({required this.icon, required this.color, this.darkIcon = false});

  final IconData icon;
  final Color color;
  final bool darkIcon;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3), boxShadow: const [BoxShadow(blurRadius: 8, color: Color(0x33000000))]),
      child: Icon(icon, color: darkIcon ? halloNavy : Colors.white, size: 22),
    );
  }
}

class _ProfileScreen extends StatelessWidget {
  const _ProfileScreen({required this.controller});

  final DriverController controller;

  @override
  Widget build(BuildContext context) {
    final p = controller.profile!;
    final s = controller.strings;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _HalloCard(
          child: Column(
            children: [
              const CircleAvatar(radius: 34, backgroundColor: halloNavy, child: Icon(Icons.person_rounded, color: Colors.white, size: 34)),
              const SizedBox(height: 12),
              Text(p.fullName ?? '—', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(p.email ?? '—'),
              if (p.phone != null) Text(p.phone!),
              if (p.status != null) ...[
                const SizedBox(height: 10),
                _StatusChip(label: p.status!.replaceAll('_', ' '), color: halloBlue),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 50,
          child: OutlinedButton.icon(
            onPressed: controller.busy ? null : () => unawaited(controller.signOut()),
            icon: const Icon(Icons.logout_rounded),
            label: Text(s.text('signOut')),
          ),
        ),
      ],
    );
  }
}

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _HalloCard(
          child: Column(
            children: [
              Icon(icon, size: 40, color: halloNavy),
              const SizedBox(height: 12),
              Text(text, textAlign: TextAlign.center),
            ],
          ),
        ),
      ],
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job, required this.strings, this.active = false, this.onTap});

  final DriverJob job;
  final DriverStrings strings;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: _HalloCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(job.trackingId ?? job.id, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: halloNavy)),
                ),
                if (active || job.status != null) _StatusChip(label: (job.status ?? 'active').replaceAll('_', ' '), color: active ? halloSuccess : halloBlue),
              ],
            ),
            const SizedBox(height: 14),
            _RouteLine(icon: Icons.radio_button_checked_rounded, color: halloNavy, value: job.pickup ?? '—'),
            const SizedBox(height: 8),
            _RouteLine(icon: Icons.location_on_rounded, color: halloGold, value: job.dropoff ?? '—'),
            const SizedBox(height: 14),
            Wrap(
              spacing: 18,
              runSpacing: 10,
              children: [
                if (job.distanceKm != null) _InfoValue(label: strings.text('distance'), value: '${job.distanceKm!.toStringAsFixed(0)} km'),
                if (job.priceEtb != null) _InfoValue(label: strings.text('fare'), value: '${job.priceEtb!.toStringAsFixed(0)} ETB'),
                if (job.vehicleType != null) _InfoValue(label: strings.text('truck'), value: job.vehicleType!),
                if (job.cargo != null && job.cargo!.trim().isNotEmpty) _InfoValue(label: strings.text('cargo'), value: job.cargo!),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.icon, required this.title, required this.value, required this.onTap});

  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: _HalloCard(
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: halloBlue.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(15)),
              child: Icon(icon, color: halloBlue),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 4),
                  Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: halloNavy)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Color(0xFF8A98AC)),
          ],
        ),
      ),
    );
  }
}

class _HalloCard extends StatelessWidget {
  const _HalloCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(child: Padding(padding: const EdgeInsets.all(18), child: child));
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: compact ? 34 : 42,
          height: compact ? 34 : 42,
          decoration: BoxDecoration(color: halloNavy, borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.local_shipping_rounded, color: halloGold),
        ),
        const SizedBox(width: 10),
        Text('HALLO DRIVER', style: TextStyle(fontSize: compact ? 17 : 20, fontWeight: FontWeight.w900, letterSpacing: 0.4, color: compact ? Colors.white : halloNavy)),
      ],
    );
  }
}

class _LanguageMenu extends StatelessWidget {
  const _LanguageMenu({required this.controller, this.dark = false});

  final DriverController controller;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final label = switch (controller.language) {
      DriverLanguage.en => 'EN',
      DriverLanguage.or => 'OR',
      DriverLanguage.am => 'አማ',
    };
    return PopupMenuButton<DriverLanguage>(
      tooltip: 'Language',
      onSelected: (value) => unawaited(controller.setLanguage(value)),
      itemBuilder: (context) => const [
        PopupMenuItem(value: DriverLanguage.en, child: Text('English · EN')),
        PopupMenuItem(value: DriverLanguage.or, child: Text('Afaan Oromo · OR')),
        PopupMenuItem(value: DriverLanguage.am, child: Text('አማርኛ · አማ')),
      ],
      child: Container(
        constraints: const BoxConstraints(minWidth: 48, minHeight: 44),
        alignment: Alignment.center,
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: dark ? Colors.white.withValues(alpha: 0.12) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: dark ? null : Border.all(color: const Color(0xFFD6DEEA)),
        ),
        child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: dark ? Colors.white : halloNavy)),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color, this.darkText = false});

  final String label;
  final Color color;
  final bool darkText;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: color.withValues(alpha: darkText ? 0.25 : 0.12), borderRadius: BorderRadius.circular(999)),
      child: Text(label.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.35, color: darkText ? halloNavy : color)),
    );
  }
}

class _InfoValue extends StatelessWidget {
  const _InfoValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 92, maxWidth: 220),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: const Color(0xFF64748B))),
          const SizedBox(height: 3),
          Text(value, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, color: halloNavy)),
        ],
      ),
    );
  }
}

class _RouteLine extends StatelessWidget {
  const _RouteLine({required this.icon, required this.color, required this.value});

  final IconData icon;
  final Color color;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 10),
        Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, color: halloNavy))),
      ],
    );
  }
}

class _MessageBanner extends StatelessWidget {
  const _MessageBanner({required this.text, required this.error});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error ? halloDanger : halloSuccess;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.09), borderRadius: BorderRadius.circular(14), border: Border.all(color: color.withValues(alpha: 0.35))),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(error ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
