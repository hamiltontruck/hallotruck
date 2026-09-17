import 'package:supabase_flutter/supabase_flutter.dart';

import 'core.dart';

class DriverBackend {
  DriverBackend({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;

  final SupabaseClient _client;

  User? get currentUser => _client.auth.currentUser;

  Future<void> signIn({required String email, required String pin}) async {
    if (!DriverValidators.validEmail(email)) throw const FormatException('invalid_email');
    if (!DriverValidators.validPin(pin)) throw const FormatException('invalid_pin');
    await _client.auth.signInWithPassword(
      email: email.trim().toLowerCase(),
      password: pin.trim(),
    );
    await profile();
  }

  Future<void> signUp({
    required String name,
    required String phone,
    required String email,
    required String pin,
  }) async {
    if (!DriverValidators.validName(name)) throw const FormatException('invalid_name');
    if (!DriverValidators.validEthiopianPhone(phone)) throw const FormatException('invalid_phone');
    if (!DriverValidators.validEmail(email)) throw const FormatException('invalid_email');
    if (!DriverValidators.validPin(pin)) throw const FormatException('invalid_pin');

    await _client.auth.signUp(
      email: email.trim().toLowerCase(),
      password: pin.trim(),
      data: {
        'full_name': name.trim(),
        'phone': DriverValidators.normalizeEthiopianPhone(phone),
        'role': 'driver',
      },
    );
  }

  Future<void> signOut() => _client.auth.signOut();

  Future<DriverProfile> profile() async {
    final user = currentUser;
    if (user == null) throw StateError('session_expired');

    final result = await _client
        .from('profiles')
        .select('id,role,driver_status,full_name,phone,vehicle_type,rating_avg')
        .eq('id', user.id)
        .limit(1);

    final rows = List<Map<String, dynamic>>.from(result);
    if (rows.isEmpty) throw StateError('profile_missing');

    final profile = DriverProfile.fromMap(rows.first, email: user.email);
    if (profile.role != 'driver') {
      await signOut();
      throw StateError('not_authorized');
    }
    return profile;
  }

  Future<List<DriverJob>> availableJobs() async {
    await profile();
    final result = await _client.rpc('get_available_jobs');
    final rows = List<Map<String, dynamic>>.from(result as List);
    return rows.map(DriverJob.fromMap).toList(growable: false);
  }

  Future<DriverJob?> activeTrip() async {
    final driver = await profile();
    final result = await _client
        .from('orders')
        .select(
          'id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,cargo_description,truck_id,status',
        )
        .eq('driver_id', driver.id)
        .or('status.eq.accepted,status.eq.in_transit')
        .limit(1);

    final rows = List<Map<String, dynamic>>.from(result);
    return rows.isEmpty ? null : DriverJob.fromMap(rows.first);
  }

  Future<LiveTripSnapshot?> liveTrip(String orderId) async {
    await profile();
    final result = await _client.rpc(
      'customer_get_live_trip',
      params: {'p_order_id': orderId},
    );
    final rows = List<Map<String, dynamic>>.from(result as List);
    return rows.isEmpty ? null : LiveTripSnapshot.fromMap(rows.first);
  }
}
