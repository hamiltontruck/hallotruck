import 'package:flutter_test/flutter_test.dart';
import 'package:hallo_driver_flutter/src/core.dart';

void main() {
  group('driver auth contract', () {
    test('PIN is exactly six numeric digits', () {
      expect(DriverValidators.validPin('123456'), isTrue);
      expect(DriverValidators.validPin('12345'), isFalse);
      expect(DriverValidators.validPin('1234567'), isFalse);
      expect(DriverValidators.validPin('12a456'), isFalse);
    });

    test('Ethiopian mobile formats normalize without inventing a number', () {
      expect(DriverValidators.validEthiopianPhone('0912345678'), isTrue);
      expect(DriverValidators.validEthiopianPhone('+251912345678'), isTrue);
      expect(DriverValidators.normalizeEthiopianPhone('0912345678'), '+251912345678');
      expect(DriverValidators.validEthiopianPhone('555'), isFalse);
    });
  });

  group('live tracking freshness contract', () {
    final now = DateTime.utc(2026, 9, 17, 12);

    test('LIVE is at most two minutes old', () {
      expect(
        DriverValidators.freshness(now.subtract(const Duration(minutes: 2)), now: now),
        TrackingFreshness.live,
      );
    });

    test('STALE is older than two and at most thirty minutes', () {
      expect(
        DriverValidators.freshness(now.subtract(const Duration(minutes: 3)), now: now),
        TrackingFreshness.stale,
      );
      expect(
        DriverValidators.freshness(now.subtract(const Duration(minutes: 30)), now: now),
        TrackingFreshness.stale,
      );
    });

    test('OFFLINE is older than thirty minutes or missing', () {
      expect(
        DriverValidators.freshness(now.subtract(const Duration(minutes: 31)), now: now),
        TrackingFreshness.offline,
      );
      expect(DriverValidators.freshness(null, now: now), TrackingFreshness.offline);
    });
  });
}
