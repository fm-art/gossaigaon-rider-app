package com.gossaigaon.rider;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseReference;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class RiderDialogs {

    public interface PassCallback {
        void onConfirmPass(TripHelper.TripGroup trip, String reason);
    }

    public static void applyNativeTheme(Activity act, EditText[] darkInputs, EditText upiInput) {
        act.findViewById(R.id.layoutRiderAvatar).setBackground(RiderUiKit.makeBox(act, "#142824", "#16A34A", 1.2f, 14, false));
        act.findViewById(R.id.tvRiderRating).setBackground(RiderUiKit.makeBox(act, "#291E0B", "#785312", 1f, 8, false));
        act.findViewById(R.id.btnSoundToggle).setBackground(RiderUiKit.makeBox(act, "#172238", "#24344D", 1.2f, 10, false));
        act.findViewById(R.id.btnDutyToggle).setBackground(RiderUiKit.makeBox(act, "#090E1A", "#24344D", 1.2f, 20, false));
        act.findViewById(R.id.tvActiveCount).setBackground(RiderUiKit.makeBox(act, "#202D45", "#24344D", 1f, 12, false));
        act.findViewById(R.id.btnBannerDeposit).setBackground(RiderUiKit.makeBox(act, "#EF4444", "#EF4444", 0f, 10, false));

        act.findViewById(R.id.cardEarningsHero).setBackground(RiderUiKit.makeGradient(act, "#0E2A47", "#0B192E", "#38BDF8", 1.5f, 20));
        act.findViewById(R.id.cardCodHero).setBackground(RiderUiKit.makeGradient(act, "#172238", "#0F172A", "#24344D", 1.2f, 20));
        act.findViewById(R.id.cardRatings).setBackground(RiderUiKit.makeBox(act, "#0F172A", "#785312", 1f, 18, false));
        act.findViewById(R.id.btnWithdrawEarnings).setBackground(RiderUiKit.makeBox(act, "#0284C7", "#0284C7", 0f, 12, false));
        act.findViewById(R.id.btnDepositCod).setBackground(RiderUiKit.makeBox(act, "#16A34A", "#16A34A", 0f, 12, false));

        act.findViewById(R.id.cardHelpline).setBackground(RiderUiKit.makeBox(act, "#0F172A", "#38BDF8", 1f, 16, false));
        act.findViewById(R.id.cardProfileForm).setBackground(RiderUiKit.makeBox(act, "#0F172A", "#24344D", 1f, 18, false));
        act.findViewById(R.id.btnCallHub).setBackground(RiderUiKit.makeBox(act, "#172238", "#24344D", 1.2f, 10, false));
        act.findViewById(R.id.btnWaHub).setBackground(RiderUiKit.makeBox(act, "#10B981", "#10B981", 0f, 10, false));
        act.findViewById(R.id.btnSendFeedback).setBackground(RiderUiKit.makeBox(act, "#0F172A", "#38BDF8", 1.2f, 10, false));
        act.findViewById(R.id.btnSaveProfile).setBackground(RiderUiKit.makeBox(act, "#16A34A", "#16A34A", 0f, 14, false));
        act.findViewById(R.id.btnLogout).setBackground(RiderUiKit.makeBox(act, "#0F172A", "#EF4444", 1.5f, 14, false));

        for (EditText et : darkInputs) et.setBackground(RiderUiKit.makeBox(act, "#050811", "#24344D", 1.3f, 12, false));
        upiInput.setBackground(RiderUiKit.makeBox(act, "#050811", "#38BDF8", 1.3f, 12, false));
    }

    public static TripHelper.OrderData parseOrder(DataSnapshot ds) {
        TripHelper.OrderData o = new TripHelper.OrderData();
        o.orderId = ds.getKey();
        o.restaurantId = TripHelper.getStr(ds, "restaurantId", "");
        o.customerUid = TripHelper.getStr(ds, "customerUid", "");
        o.batchGroupId = TripHelper.getStr(ds, "batchGroupId", "");
        o.deliveryUid = TripHelper.getStr(ds, "deliveryUid", "");
        o.phone = TripHelper.getStr(ds, "phone", "");
        o.address = TripHelper.getStr(ds, "address", "Gossaigaon");
        o.customerLat = TripHelper.getDouble(ds, "customerLat", 0);
        o.customerLng = TripHelper.getDouble(ds, "customerLng", 0);
        o.locationLink = TripHelper.getStr(ds, "locationLink", "");
        o.deliveryOtp = TripHelper.getStr(ds, "deliveryOtp", "");
        o.pickupOtp = TripHelper.getStr(ds, "pickupOtp", "");
        o.paymentMode = TripHelper.getStr(ds, "paymentMode", "COD");
        o.paymentStatus = TripHelper.getStr(ds, "paymentStatus", "COD");
        o.status = TripHelper.getStr(ds, "status", "PLACED");
        Object acc = ds.child("riderAccepted").getValue();
        o.riderAccepted = acc instanceof Boolean ? (Boolean) acc : null;
        o.emergencyAlert = TripHelper.getBool(ds, "emergencyAlert", false);
        o.emergencyDetails = TripHelper.getStr(ds, "emergencyDetails", "");
        o.assignedAt = TripHelper.getLong(ds, "assignedAt", TripHelper.getLong(ds, "createdAt", System.currentTimeMillis()));
        o.createdAt = TripHelper.getLong(ds, "createdAt", System.currentTimeMillis());
        o.storePickupVerifiedAt = TripHelper.getLong(ds, "storePickupVerifiedAt", 0);
        o.totalAmount = TripHelper.getDouble(ds, "totalAmount", 0);
        o.deliveryCharge = TripHelper.getDouble(ds, "deliveryCharge", 0);

        for (DataSnapshot itemSnap : ds.child("items").getChildren()) {
            TripHelper.OrderItem it = new TripHelper.OrderItem();
            it.name = TripHelper.getStr(itemSnap, "name", "Item");
            it.qty = (int) TripHelper.getLong(itemSnap, "qty", 1);
            it.price = TripHelper.getDouble(itemSnap, "price", 0);
            o.items.add(it);
        }
        for (DataSnapshot rejSnap : ds.child("rejectedByRiders").getChildren()) {
            if (rejSnap.getKey() != null) o.rejectedRiderUids.add(rejSnap.getKey());
        }
        return o;
    }

    public static List<TripHelper.TripGroup> groupOrders(List<TripHelper.OrderData> source) {
        Map<String, TripHelper.TripGroup> map = new LinkedHashMap<>();
        for (TripHelper.OrderData o : source) {
            String key = !o.batchGroupId.isEmpty() ? o.batchGroupId : (o.customerUid + "_" + (!o.deliveryOtp.isEmpty() ? o.deliveryOtp : o.createdAt));
            TripHelper.TripGroup g = map.get(key);
            if (g == null) {
                g = new TripHelper.TripGroup();
                g.tripId = key; g.customerUid = o.customerUid; g.phone = o.phone; g.address = o.address;
                g.customerLat = o.customerLat; g.customerLng = o.customerLng; g.locationLink = o.locationLink;
                g.deliveryOtp = o.deliveryOtp; g.paymentMode = o.paymentMode; g.assignedAt = o.assignedAt;
                map.put(key, g);
            }
            g.orders.add(o);
        }
        return new ArrayList<>(map.values());
    }

    public static void showPassDialog(Context ctx, TripHelper.TripGroup trip, PassCallback cb) {
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 10), RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 8));

        String[] reasons = {"Vehicle breakdown / Tyre puncture", "Heavy rainfall / Waterlogging", "Personal emergency / Ending shift", "Customer unreachable"};
        Spinner sp = new Spinner(ctx);
        sp.setAdapter(new ArrayAdapter<>(ctx, android.R.layout.simple_spinner_dropdown_item, reasons));
        box.addView(sp);

        final EditText etNote = new EditText(ctx);
        etNote.setHint("Extra Note (Optional)");
        box.addView(etNote);

        new AlertDialog.Builder(ctx)
                .setTitle("Pass / Reject Trip #" + RiderUiKit.shortId(trip.tripId))
                .setView(box)
                .setPositiveButton("Confirm Pass", (d, w) -> {
                    String r = sp.getSelectedItem().toString(), n = TripHelper.sanitizeText(etNote.getText().toString());
                    cb.onConfirmPass(trip, n.isEmpty() ? r : r + " (" + n + ")");
                })
                .setNegativeButton("Go Back", null).show();
    }

    public static void showSosDialog(Context ctx, DatabaseReference db, TripHelper.TripGroup trip) {
        String[] reasons = {"🌧️ Heavy rainfall / waterlogging", "🛵 Tyre puncture / breakdown", "🚦 Traffic jam", "📞 Customer gate locked"};
        Spinner sp = new Spinner(ctx);
        sp.setAdapter(new ArrayAdapter<>(ctx, android.R.layout.simple_spinner_dropdown_item, reasons));
        new AlertDialog.Builder(ctx)
                .setTitle("⚠️ Road Delay / SOS Alert").setView(sp)
                .setPositiveButton("Broadcast Alert", (d, w) -> {
                    long now = System.currentTimeMillis();
                    String msg = "Rider update: " + sp.getSelectedItem().toString();
                    for (TripHelper.OrderData o : trip.orders) {
                        Map<String, Object> up = new HashMap<>();
                        up.put("emergencyAlert", true); up.put("emergencyDetails", msg); up.put("updatedAt", now);
                        db.child("orders").child(o.orderId).updateChildren(up);
                    }
                    Toast.makeText(ctx, "⚠️ Delay alert sent!", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null).show();
    }

    public static void showPinDialog(Context ctx, SharedPreferences secPrefs, DatabaseReference db,
            TripHelper.TripGroup trip, double totalBill, boolean isPrepaid, double riderLat, double riderLng) {
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 12), RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 8));

        final EditText etPin = new EditText(ctx);
        etPin.setHint("---- (4-Digit Customer PIN)");
        etPin.setInputType(InputType.TYPE_CLASS_NUMBER);
        etPin.setTextSize(20);
        etPin.setGravity(Gravity.CENTER);
        box.addView(etPin);

        final TextView tvChange = new TextView(ctx);
        if (!isPrepaid) {
            TextView tvCod = new TextView(ctx);
            tvCod.setText(String.format(Locale.US, "Total COD Cash to Collect: ₹%.2f", totalBill));
            tvCod.setTextColor(Color.parseColor("#16A34A"));
            tvCod.setTypeface(null, Typeface.BOLD);
            box.addView(tvCod);

            final EditText etCash = new EditText(ctx);
            etCash.setHint("Cash Tendered (e.g. 500)");
            etCash.setInputType(InputType.TYPE_CLASS_NUMBER);
            box.addView(etCash);
            box.addView(tvChange);

            etCash.addTextChangedListener(new TextWatcher() {
                @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
                @Override public void onTextChanged(CharSequence s, int a, int b, int c) {
                    try {
                        double ch = Double.parseDouble(s.toString()) - totalBill;
                        tvChange.setText(ch >= 0 ? String.format(Locale.US, "Change to Return: ₹%.2f", ch) : String.format(Locale.US, "Need ₹%.2f more", Math.abs(ch)));
                        tvChange.setTextColor(Color.parseColor(ch >= 0 ? "#16A34A" : "#EF4444"));
                    } catch (Exception e) { tvChange.setText(""); }
                }
                @Override public void afterTextChanged(Editable s) {}
            });
        }

        new AlertDialog.Builder(ctx)
                .setTitle("🔐 Verify PIN & Complete Trip").setView(box)
                .setPositiveButton("Verify & Complete", (d, w) -> {
                    long lockUntil = secPrefs.getLong("lock_" + trip.tripId, 0L);
                    if (System.currentTimeMillis() < lockUntil) {
                        Toast.makeText(ctx, "🔒 Security Locked! Wait " + ((lockUntil - System.currentTimeMillis()) / 1000) + "s.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    String entered = etPin.getText().toString().trim();
                    if (!trip.deliveryOtp.isEmpty() && !entered.equals(trip.deliveryOtp)) {
                        int fails = secPrefs.getInt("fails_" + trip.tripId, 0) + 1;
                        if (fails >= 3) {
                            secPrefs.edit().putLong("lock_" + trip.tripId, System.currentTimeMillis() + 60000L).putInt("fails_" + trip.tripId, 0).apply();
                            Toast.makeText(ctx, "🚨 3 Wrong Attempts! Locked 60s.", Toast.LENGTH_SHORT).show();
                        } else {
                            secPrefs.edit().putInt("fails_" + trip.tripId, fails).apply();
                            Toast.makeText(ctx, "❌ Wrong PIN! (" + (3 - fails) + " left)", Toast.LENGTH_SHORT).show();
                        }
                        return;
                    }
                    secPrefs.edit().remove("lock_" + trip.tripId).remove("fails_" + trip.tripId).apply();
                    long now = System.currentTimeMillis();
                    double delDistKm = TripHelper.calculateDistanceKm(riderLat, riderLng, trip.customerLat, trip.customerLng);
                    for (TripHelper.OrderData o : trip.orders) {
                        Map<String, Object> up = new HashMap<>();
                        up.put("status", "DELIVERED");
                        up.put("deliveredLat", riderLat);
                        up.put("deliveredLng", riderLng);
                        if (delDistKm >= 0) up.put("deliveredDistanceKm", Math.round(delDistKm * 100.0) / 100.0);
                        up.put("updatedAt", now);
                        db.child("orders").child(o.orderId).updateChildren(up);
                    }
                    Toast.makeText(ctx, "🎉 PIN Verified! Trip Completed!", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null).show();
    }

    public static void showWithdrawDialog(Context ctx, DatabaseReference db, String uid, String riderName,
            String riderPhone, String riderUpi, double availableBalance, double minPayout, double maxPayout) {
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 12), RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 8));

        TextView balTv = new TextView(ctx);
        balTv.setText(String.format(Locale.US, "Available Payout: ₹%.2f\nLimits: ₹%.0f - ₹%.0f", availableBalance, minPayout, maxPayout));
        balTv.setTextColor(Color.parseColor("#0284C7")); balTv.setTypeface(null, Typeface.BOLD);
        box.addView(balTv);

        final EditText etAmt = new EditText(ctx);
        etAmt.setInputType(InputType.TYPE_CLASS_NUMBER);
        etAmt.setText(String.valueOf((int) Math.min(Math.floor(availableBalance), maxPayout)));
        box.addView(etAmt);

        final EditText etUpi = new EditText(ctx);
        etUpi.setText(riderUpi); etUpi.setHint("Verify Your Receiving UPI ID");
        box.addView(etUpi);

        new AlertDialog.Builder(ctx)
                .setTitle("Withdraw Earnings to UPI").setView(box)
                .setPositiveButton("Send Request", (d, w) -> {
                    double amt; try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception e) { amt = 0; }
                    String upi = TripHelper.sanitizeText(etUpi.getText().toString());
                    if (amt < minPayout || amt > maxPayout || amt > availableBalance || !TripHelper.isValidUpiId(upi)) {
                        Toast.makeText(ctx, "Invalid amount or UPI ID!", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    Map<String, Object> req = new HashMap<>();
                    req.put("riderUid", uid); req.put("riderName", riderName); req.put("riderPhone", riderPhone);
                    req.put("riderUpiId", upi); req.put("amount", amt); req.put("status", "PENDING"); req.put("createdAt", System.currentTimeMillis());
                    db.child("riderPayouts").push().setValue(req);
                    Toast.makeText(ctx, "🎉 Payout request sent to Admin!", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null).show();
    }

    public static void showDepositDialog(Context ctx, DatabaseReference db, String uid, String riderName,
            String adminUpiId, double netCashInHand, double pendingSettlementsTotal,
            double minDeposit, double maxDeposit, List<String> allExistingUtrs) {
        double maxAllowable = Math.max(0, netCashInHand - pendingSettlementsTotal);
        ScrollView sv = new ScrollView(ctx);
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 12), RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 8));
        sv.addView(box);

        TextView balTv = new TextView(ctx);
        balTv.setText(String.format(Locale.US, "COD Cash in Hand: ₹%.2f (Max Pending Allowed: ₹%.2f)\nLimits: ₹%.0f - ₹%.0f",
                netCashInHand, maxAllowable, minDeposit, maxDeposit));
        balTv.setTextColor(Color.parseColor("#16A34A"));
        balTv.setTypeface(null, Typeface.BOLD);
        balTv.setPadding(0, 0, 0, RiderUiKit.dp(ctx, 8));
        box.addView(balTv);

        final EditText etAmt = new EditText(ctx);
        etAmt.setInputType(InputType.TYPE_CLASS_NUMBER);
        etAmt.setText(String.valueOf((int) Math.min(Math.round(maxAllowable), maxDeposit)));
        etAmt.setHint("Deposit Amount (₹)");
        box.addView(etAmt);

        final Spinner spMode = new Spinner(ctx);
        spMode.setAdapter(new ArrayAdapter<>(ctx, android.R.layout.simple_spinner_dropdown_item, new String[]{"UPI (Scan QR / App Pay)", "CASH (Office Handover)"}));
        box.addView(spMode);

        final LinearLayout upiSection = new LinearLayout(ctx);
        upiSection.setOrientation(LinearLayout.VERTICAL);
        upiSection.setGravity(Gravity.CENTER_HORIZONTAL);
        upiSection.setPadding(0, RiderUiKit.dp(ctx, 8), 0, RiderUiKit.dp(ctx, 4));

        TextView tvUpiId = new TextView(ctx);
        tvUpiId.setText("Admin UPI: " + adminUpiId);
        tvUpiId.setTextColor(Color.parseColor("#0284C7"));
        tvUpiId.setTypeface(null, Typeface.BOLD);
        tvUpiId.setPadding(0, 0, 0, RiderUiKit.dp(ctx, 6));
        upiSection.addView(tvUpiId);

        final ImageView ivQr = new ImageView(ctx);
        int qrPx = RiderUiKit.dp(ctx, 180);
        LinearLayout.LayoutParams qrp = new LinearLayout.LayoutParams(qrPx, qrPx);
        qrp.bottomMargin = RiderUiKit.dp(ctx, 10);
        ivQr.setLayoutParams(qrp);
        ivQr.setBackgroundColor(Color.WHITE);
        int pad = RiderUiKit.dp(ctx, 8);
        ivQr.setPadding(pad, pad, pad, pad);
        upiSection.addView(ivQr);

        LinearLayout btnRow = new LinearLayout(ctx);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        Button btnPayUpi = RiderUiKit.makeBtn(ctx, "📲 Open UPI App", "#0284C7", "#FFFFFF", "#0284C7");
        btnPayUpi.setOnClickListener(v -> {
            double amt = maxAllowable;
            try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception ignored) {}
            String uri = "upi://pay?pa=" + Uri.encode(adminUpiId) + "&pn=GossaigaonBazarAdmin&am=" + String.format(Locale.US, "%.2f", Math.max(1, amt)) + "&cu=INR";
            try { ctx.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(uri))); } catch (Exception e) { Toast.makeText(ctx, "UPI App not found", Toast.LENGTH_SHORT).show(); }
        });
        btnRow.addView(btnPayUpi, new LinearLayout.LayoutParams(0, RiderUiKit.dp(ctx, 40), 1f));

        Button btnCopy = RiderUiKit.makeBtn(ctx, "📋 Copy UPI", "#172238", "#38BDF8", "#38BDF8");
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, RiderUiKit.dp(ctx, 40), 0.9f);
        cp.leftMargin = RiderUiKit.dp(ctx, 6);
        btnCopy.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Admin UPI", adminUpiId));
            Toast.makeText(ctx, "Admin UPI copied!", Toast.LENGTH_SHORT).show();
        });
        btnRow.addView(btnCopy, cp);
        upiSection.addView(btnRow, new LinearLayout.LayoutParams(-1, -2));

        final EditText etUtr = new EditText(ctx);
        etUtr.setHint("Enter Exact 12-Digit UPI UTR No.");
        etUtr.setInputType(InputType.TYPE_CLASS_NUMBER);
        etUtr.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams utrp = new LinearLayout.LayoutParams(-1, -2);
        utrp.topMargin = RiderUiKit.dp(ctx, 8);
        upiSection.addView(etUtr, utrp);
        box.addView(upiSection);

        final TextView tvCashNote = new TextView(ctx);
        tvCashNote.setText("📍 Hand over exact COD cash at Gossaigaon Bazar Hub Office and tap Submit.");
        tvCashNote.setPadding(RiderUiKit.dp(ctx, 10), RiderUiKit.dp(ctx, 12), RiderUiKit.dp(ctx, 10), RiderUiKit.dp(ctx, 12));
        tvCashNote.setVisibility(View.GONE);
        box.addView(tvCashNote);

        Runnable refreshQr = () -> {
            double amt = maxAllowable;
            try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception ignored) {}
            if (amt <= 0) amt = maxAllowable;
            String upiString = "upi://pay?pa=" + Uri.encode(adminUpiId) + "&pn=GossaigaonBazarAdmin&am=" + String.format(Locale.US, "%.2f", amt) + "&cu=INR";
            Bitmap qrBmp = generateQrBitmap(upiString, 360);
            if (qrBmp != null) ivQr.setImageBitmap(qrBmp);
        };
        refreshQr.run();

        etAmt.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { refreshQr.run(); }
            @Override public void afterTextChanged(Editable s) {}
        });

        spMode.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int pos, long id) {
                upiSection.setVisibility(pos == 0 ? View.VISIBLE : View.GONE);
                tvCashNote.setVisibility(pos == 1 ? View.VISIBLE : View.GONE);
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        new AlertDialog.Builder(ctx)
                .setTitle("Deposit COD Cash to Admin").setView(sv)
                .setPositiveButton("Submit Verified Handover", (d, w) -> {
                    double amt; try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception e) { amt = 0; }
                    String mode = spMode.getSelectedItemPosition() == 0 ? "UPI" : "CASH";
                    String utr = etUtr.getText().toString().trim();
                    if (amt < minDeposit || amt > maxDeposit || amt > (netCashInHand - pendingSettlementsTotal)) {
                        Toast.makeText(ctx, "Invalid or exceeding deposit amount!", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    if ("UPI".equals(mode)) {
                        String err = TripHelper.validateSettlementUtr(utr, allExistingUtrs);
                        if (err != null) { Toast.makeText(ctx, err, Toast.LENGTH_SHORT).show(); return; }
                    }
                    Map<String, Object> s = new HashMap<>();
                    s.put("riderUid", uid); s.put("riderName", riderName); s.put("amount", amt);
                    s.put("mode", mode); s.put("utr", "UPI".equals(mode) ? utr : "PHYSICAL_HANDOVER");
                    s.put("status", "PENDING"); s.put("createdAt", System.currentTimeMillis());
                    db.child("settlements").push().setValue(s);
                    Toast.makeText(ctx, "🎉 Handover submitted to Admin!", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null).show();
    }

    public static void showFeedbackDialog(Context ctx, DatabaseReference db, String uid, String riderName, String riderPhone) {
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 12), RiderUiKit.dp(ctx, 20), RiderUiKit.dp(ctx, 8));
        final EditText etSub = new EditText(ctx); etSub.setHint("Subject"); box.addView(etSub);
        final EditText etMsg = new EditText(ctx); etMsg.setHint("Message"); box.addView(etMsg);

        new AlertDialog.Builder(ctx)
                .setTitle("Send Feedback to Admin").setView(box)
                .setPositiveButton("Send", (d, w) -> {
                    String sub = TripHelper.sanitizeText(etSub.getText().toString());
                    String msg = TripHelper.sanitizeText(etMsg.getText().toString());
                    if (sub.isEmpty() || msg.isEmpty()) { Toast.makeText(ctx, "Subject aur Message bharein!", Toast.LENGTH_SHORT).show(); return; }
                    Map<String, Object> fb = new HashMap<>();
                    fb.put("role", "RIDER"); fb.put("uid", uid); fb.put("name", riderName);
                    fb.put("phone", riderPhone); fb.put("subject", sub); fb.put("message", msg);
                    fb.put("status", "OPEN"); fb.put("createdAt", System.currentTimeMillis());
                    db.child("feedbacks").push().setValue(fb);
                    Toast.makeText(ctx, "💬 Ticket sent to Admin Hub!", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null).show();
    }

    public static Bitmap generateQrBitmap(String text, int sizePx) {
        try {
            BitMatrix matrix = new MultiFormatWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx);
            int[] pixels = new int[sizePx * sizePx];
            for (int y = 0; y < sizePx; y++) {
                int offset = y * sizePx;
                for (int x = 0; x < sizePx; x++) {
                    pixels[offset + x] = matrix.get(x, y) ? Color.BLACK : Color.WHITE;
                }
            }
            Bitmap bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565);
            bmp.setPixels(pixels, 0, sizePx, 0, 0, sizePx, sizePx);
            return bmp;
        } catch (Exception e) {
            return null;
        }
    }
}
