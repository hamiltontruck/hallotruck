import 'package:flutter/material.dart';

const halloNavy = Color(0xFF0F1F3D);
const halloBlue = Color(0xFF0B6EFD);
const halloGold = Color(0xFFF2B705);
const halloSurface = Color(0xFFF4F7FB);
const halloSuccess = Color(0xFF198754);
const halloWarning = Color(0xFFF59E0B);
const halloDanger = Color(0xFFDC3545);

enum DriverLanguage { en, or, am }

enum TrackingFreshness { live, stale, offline }

class DriverValidators {
  static bool validPin(String value) => RegExp(r'^\d{6}$').hasMatch(value.trim());

  static bool validEmail(String value) => RegExp(
        r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
      ).hasMatch(value.trim().toLowerCase());

  static bool validName(String value) {
    final trimmed = value.trim();
    return trimmed.length >= 2 && trimmed.length <= 120;
  }

  static bool validEthiopianPhone(String value) {
    final compact = value.trim().replaceAll(RegExp(r'[\s-]'), '');
    return RegExp(r'^(?:09\d{8}|\+2519\d{8})$').hasMatch(compact);
  }

  static String normalizeEthiopianPhone(String value) {
    final compact = value.trim().replaceAll(RegExp(r'[\s-]'), '');
    if (compact.startsWith('09') && compact.length == 10) {
      return '+251${compact.substring(1)}';
    }
    return compact;
  }

  static TrackingFreshness freshness(DateTime? recordedAt, {DateTime? now}) {
    if (recordedAt == null) return TrackingFreshness.offline;
    final age = (now ?? DateTime.now().toUtc()).difference(recordedAt.toUtc());
    if (age.isNegative || age <= const Duration(minutes: 2)) {
      return TrackingFreshness.live;
    }
    if (age <= const Duration(minutes: 30)) return TrackingFreshness.stale;
    return TrackingFreshness.offline;
  }
}

class DriverStrings {
  const DriverStrings(this.language);

  final DriverLanguage language;

  static const Map<DriverLanguage, Map<String, String>> _values = {
    DriverLanguage.en: {
      'appName': 'HALLO DRIVER',
      'login': 'Sign in',
      'register': 'Create driver account',
      'fullName': 'Full name',
      'phone': 'Phone',
      'email': 'Email',
      'pin': '6-digit PIN',
      'invalidName': 'Enter your full name.',
      'invalidPhone': 'Use +2519XXXXXXXX or 09XXXXXXXX.',
      'invalidEmail': 'Enter a valid email address.',
      'invalidPin': 'PIN must be exactly 6 digits.',
      'home': 'Home',
      'jobs': 'Jobs',
      'trip': 'Trip',
      'wallet': 'Wallet',
      'profile': 'Profile',
      'availableJobs': 'Available jobs',
      'activeTrip': 'Active trip',
      'documents': 'Documents',
      'noJobs': 'No authorized jobs are available right now.',
      'jobsRule': 'Only jobs allowed by HALLO eligibility rules appear here.',
      'noTrip': 'No active trip.',
      'waitingGps': 'Waiting for authoritative GPS data.',
      'refresh': 'Refresh',
      'signOut': 'Sign out',
      'loading': 'Loading…',
      'retry': 'Retry',
      'configError': 'Driver Flutter is not configured yet.',
      'configHint': 'Start with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY as --dart-define values.',
      'registered': 'Account created. Continue after email confirmation if required.',
      'route': 'Route',
      'distance': 'Distance',
      'fare': 'Fare',
      'truck': 'Truck',
      'cargo': 'Cargo',
      'lastUpdate': 'Last update',
      'speed': 'Speed',
      'heading': 'Heading',
      'live': 'LIVE',
      'stale': 'STALE',
      'offline': 'OFFLINE',
      'nextSlice': 'This section is preserved for the next parity slice. No fake data is shown.',
    },
    DriverLanguage.or: {
      'appName': 'HALLO DRIVER',
      'login': 'Seeni',
      'register': 'Herrega konkolaachisaa uumi',
      'fullName': 'Maqaa guutuu',
      'phone': 'Bilbila',
      'email': 'Imeelii',
      'pin': 'PIN dijiitii 6',
      'invalidName': 'Maqaa guutuu galchi.',
      'invalidPhone': '+2519XXXXXXXX yookaan 09XXXXXXXX fayyadami.',
      'invalidEmail': 'Imeelii sirrii galchi.',
      'invalidPin': 'PIN dijiitii 6 qofa ta\'uu qaba.',
      'home': 'Mana',
      'jobs': 'Hojii',
      'trip': 'Imala',
      'wallet': 'Wallet',
      'profile': 'Profaayilii',
      'availableJobs': 'Hojii jiran',
      'activeTrip': 'Imala hojii irra jiru',
      'documents': 'Dokumantii',
      'noJobs': 'Amma hojii hayyamame hin jiru.',
      'jobsRule': 'Hojii seera hayyama HALLO guutan qofa as keessatti mul\'atu.',
      'noTrip': 'Imalli hojii irra jiru hin jiru.',
      'waitingGps': 'GPS mootummaa backend irraa dhufu eegaa jira.',
      'refresh': 'Haaromsi',
      'signOut': 'Ba\'i',
      'loading': 'Fe\'amaa jira…',
      'retry': 'Irra deebi\'i',
      'configError': 'Driver Flutter ammallee hin qindaa\'in.',
      'configHint': 'SUPABASE_URL fi SUPABASE_PUBLISHABLE_KEY --dart-define keessatti kenni.',
      'registered': 'Herregni uumameera. Yoo barbaachise imeelii mirkaneessi.',
      'route': 'Daandii',
      'distance': 'Fageenya',
      'fare': 'Gatii',
      'truck': 'Konkolaataa',
      'cargo': 'Fe\'umsa',
      'lastUpdate': 'Haaromsa dhumaa',
      'speed': 'Saffisa',
      'heading': 'Kallattii',
      'live': 'LIVE',
      'stale': 'STALE',
      'offline': 'OFFLINE',
      'nextSlice': 'Kutaan kun parity itti aanuuf eegameera. Data sobaa hin agarsiifamu.',
    },
    DriverLanguage.am: {
      'appName': 'HALLO DRIVER',
      'login': 'ግባ',
      'register': 'የአሽከርካሪ መለያ ፍጠር',
      'fullName': 'ሙሉ ስም',
      'phone': 'ስልክ',
      'email': 'ኢሜይል',
      'pin': '6 አሃዝ PIN',
      'invalidName': 'ሙሉ ስም ያስገቡ።',
      'invalidPhone': '+2519XXXXXXXX ወይም 09XXXXXXXX ይጠቀሙ።',
      'invalidEmail': 'ትክክለኛ ኢሜይል ያስገቡ።',
      'invalidPin': 'PIN በትክክል 6 አሃዝ መሆን አለበት።',
      'home': 'መነሻ',
      'jobs': 'ስራዎች',
      'trip': 'ጉዞ',
      'wallet': 'Wallet',
      'profile': 'መገለጫ',
      'availableJobs': 'ያሉ ስራዎች',
      'activeTrip': 'ንቁ ጉዞ',
      'documents': 'ሰነዶች',
      'noJobs': 'አሁን የተፈቀደ ስራ የለም።',
      'jobsRule': 'በHALLO የብቃት ህጎች የተፈቀዱ ስራዎች ብቻ እዚህ ይታያሉ።',
      'noTrip': 'ንቁ ጉዞ የለም።',
      'waitingGps': 'ትክክለኛ GPS መረጃ በመጠበቅ ላይ።',
      'refresh': 'አድስ',
      'signOut': 'ውጣ',
      'loading': 'በመጫን ላይ…',
      'retry': 'እንደገና ሞክር',
      'configError': 'Driver Flutter ገና አልተዋቀረም።',
      'configHint': 'SUPABASE_URL እና SUPABASE_PUBLISHABLE_KEY በ--dart-define ያቅርቡ።',
      'registered': 'መለያው ተፈጥሯል። ካስፈለገ ኢሜይልዎን ያረጋግጡ።',
      'route': 'መንገድ',
      'distance': 'ርቀት',
      'fare': 'ዋጋ',
      'truck': 'መኪና',
      'cargo': 'ጭነት',
      'lastUpdate': 'የመጨረሻ ዝማኔ',
      'speed': 'ፍጥነት',
      'heading': 'አቅጣጫ',
      'live': 'LIVE',
      'stale': 'STALE',
      'offline': 'OFFLINE',
      'nextSlice': 'ይህ ክፍል ለቀጣዩ parity ዙር ተጠብቋል። የሐሰት መረጃ አይታይም።',
    },
  };

  String text(String key) => _values[language]?[key] ?? _values[DriverLanguage.en]![key] ?? key;
}

class DriverProfile {
  const DriverProfile({
    required this.id,
    required this.role,
    this.status,
    this.fullName,
    this.phone,
    this.email,
    this.vehicleType,
    this.rating,
  });

  final String id;
  final String role;
  final String? status;
  final String? fullName;
  final String? phone;
  final String? email;
  final String? vehicleType;
  final double? rating;

  factory DriverProfile.fromMap(Map<String, dynamic> map, {String? email}) => DriverProfile(
        id: map['id'] as String,
        role: (map['role'] as String?) ?? '',
        status: map['driver_status'] as String?,
        fullName: map['full_name'] as String?,
        phone: map['phone'] as String?,
        email: email,
        vehicleType: map['vehicle_type'] as String?,
        rating: (map['rating_avg'] as num?)?.toDouble(),
      );
}

class DriverJob {
  const DriverJob({
    required this.id,
    this.trackingId,
    this.pickup,
    this.dropoff,
    this.vehicleType,
    this.distanceKm,
    this.priceEtb,
    this.cargo,
    this.status,
    this.truckId,
  });

  final String id;
  final String? trackingId;
  final String? pickup;
  final String? dropoff;
  final String? vehicleType;
  final double? distanceKm;
  final double? priceEtb;
  final String? cargo;
  final String? status;
  final String? truckId;

  factory DriverJob.fromMap(Map<String, dynamic> map) => DriverJob(
        id: map['id'] as String,
        trackingId: map['tracking_id'] as String?,
        pickup: map['pickup_address'] as String?,
        dropoff: map['dropoff_address'] as String?,
        vehicleType: map['vehicle_type'] as String?,
        distanceKm: (map['distance_km'] as num?)?.toDouble(),
        priceEtb: (map['price_etb'] as num?)?.toDouble(),
        cargo: map['cargo_description'] as String?,
        status: map['status'] as String?,
        truckId: map['truck_id'] as String?,
      );
}

class LiveTripSnapshot {
  const LiveTripSnapshot({
    required this.orderId,
    this.pickupLat,
    this.pickupLng,
    this.dropoffLat,
    this.dropoffLng,
    this.truckLat,
    this.truckLng,
    this.heading,
    this.speedKmh,
    this.recordedAt,
  });

  final String orderId;
  final double? pickupLat;
  final double? pickupLng;
  final double? dropoffLat;
  final double? dropoffLng;
  final double? truckLat;
  final double? truckLng;
  final double? heading;
  final double? speedKmh;
  final DateTime? recordedAt;

  factory LiveTripSnapshot.fromMap(Map<String, dynamic> map) => LiveTripSnapshot(
        orderId: map['order_id'] as String,
        pickupLat: (map['pickup_lat'] as num?)?.toDouble(),
        pickupLng: (map['pickup_lng'] as num?)?.toDouble(),
        dropoffLat: (map['dropoff_lat'] as num?)?.toDouble(),
        dropoffLng: (map['dropoff_lng'] as num?)?.toDouble(),
        truckLat: (map['truck_lat'] as num?)?.toDouble(),
        truckLng: (map['truck_lng'] as num?)?.toDouble(),
        heading: (map['heading'] as num?)?.toDouble(),
        speedKmh: (map['speed_kmh'] as num?)?.toDouble(),
        recordedAt: DateTime.tryParse((map['recorded_at'] as String?) ?? ''),
      );
}
