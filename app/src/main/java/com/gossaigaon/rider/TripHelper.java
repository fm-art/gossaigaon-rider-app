package com.gossaigaon.rider;

import com.google.firebase.database.DataSnapshot;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public class TripHelper {

    public static class OrderItem {
        public String name;
        public int qty;
        public double price;
    }

    public static class OrderData {
        public String orderId;
        public String restaurantId;
        public String customerUid;
        public String batchGroupId;
        public String deliveryUid;
        public String phone;
        public String address;
        public double customerLat;
        public double customerLng;
        public String locationLink;
        public String deliveryOtp;
        public String pickupOtp;
        public String paymentMode;
        public String paymentStatus;
        public String status;
        public Boolean riderAccepted;
        public boolean emergencyAlert;
        public String emergencyDetails;
        public long assignedAt;
        public long createdAt;
        public long storePickupVerifiedAt;
        public double totalAmount;
        public double deliveryCharge;
        public List<OrderItem> items = new ArrayList<>();
        public List<String> rejectedRiderUids = new ArrayList<>();
    }

    public static class TripGroup {
        public String tripId;
        public String customerUid;
        public String phone;
        public String address;
        public double customerLat;
        public double customerLng;
        public String locationLink;
        public String deliveryOtp;
        public String paymentMode;
        public long assignedAt;
        public List<OrderData> orders = new ArrayList<>();
    }

    public static class StoreData {
        public String id;
        public String name = "Store";
        public String address = "Gossaigaon Bazar";
        public String phone = "";
        public double lat = 26.4524;
        public double lng = 89.9723;
    }

    public static String getStr(DataSnapshot snap, String key, String def) {
        Object v = snap.child(key).getValue();
        return v != null ? String.valueOf(v) : def;
    }

    public static double getDouble(DataSnapshot snap, String key, double def) {
        Object v = snap.child(key).getValue();
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof String) {
            try { return Double.parseDouble((String) v); } catch (Exception ignored) {}
        }
        return def;
    }

    public static long getLong(DataSnapshot snap, String key, long def) {
        Object v = snap.child(key).getValue();
        if (v instanceof Number) return ((Number) v).longValue();
        if (v instanceof String) {
            try { return Long.parseLong((String) v); } catch (Exception ignored) {}
        }
        return def;
    }

    public static boolean getBool(DataSnapshot snap, String key, boolean def) {
        Object v = snap.child(key).getValue();
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof String) return Boolean.parseBoolean((String) v);
        return def;
    }

    public static double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        if (lat1 == 0 || lon1 == 0 || lat2 == 0 || lon2 == 0) return -1;
        double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    public static String getStorePickupCode(OrderData o) {
        if (o.pickupOtp != null && !o.pickupOtp.isEmpty()) return o.pickupOtp;
        int hash = 0;
        for (int i = 0; i < o.orderId.length(); i++) {
            hash = (hash << 5) - hash + o.orderId.charAt(i);
        }
        return String.valueOf(Math.abs(hash) % 9000 + 1000);
    }

    public static boolean isTripPickedUp(TripGroup trip) {
        if (trip == null || trip.orders == null) return false;
        for (OrderData o : trip.orders) {
            if ("PICKED_UP".equals(o.status) || "OUT_FOR_DELIVERY".equals(o.status) || "DELIVERED".equals(o.status)
                    || o.storePickupVerifiedAt > 0) {
                return true;
            }
        }
        return false;
    }

    public static boolean isValidIndianMobile(String phone) {
        if (phone == null) return false;
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() > 10) digits = digits.substring(digits.length() - 10);
        return Pattern.matches("^[6-9]\\d{9}$", digits);
    }

    public static boolean isValidUpiId(String upi) {
        return upi != null && Pattern.matches("^[a-zA-Z0-9.\\-_]{2,256}@[a-zA-Z]{2,64}$", upi.trim());
    }

    public static String validateSettlementUtr(String utr, List<String> existingUtrs) {
        String clean = utr == null ? "" : utr.trim();
        if (!Pattern.matches("^\\d{12}$", clean)) return "UTR number exact 12 digits ka hona chahiye!";
        if (Pattern.matches("^(\\d)\\1{11}$", clean) || "123456789012".equals(clean) || clean.startsWith("0000")) {
            return "Fake UTR pattern allowed nahi hai!";
        }
        if (existingUtrs != null && existingUtrs.contains(clean)) {
            return "Yeh UTR pehle se use ho chuka hai!";
        }
        return null;
    }
}
