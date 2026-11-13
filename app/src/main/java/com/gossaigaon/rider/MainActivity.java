package com.gossaigaon.rider;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ValueEventListener;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_PERMS = 201;

    private FirebaseAuth mAuth;
    private DatabaseReference db;
    private FirebaseUser currentUser;

    private TextView tvSuspendedBanner, tvPersonalNotice, tvBroadcastBanner, tvApprovalBanner, tvCashLimitBanner;
    private TextView tvRiderName, tvRiderVehicle, tvRiderRating, tvDutyLabel, tvGpsSyncTime, tvActiveCount;
    private View dotOnline, layoutGpsBar;
    private Button btnSoundToggle;

    private ScrollView scrollActive, scrollEarnings, scrollProfile;
    private TextView tvNavActive, tvNavEarnings, tvNavProfile;

    private LinearLayout containerActiveTrips, containerRatings, containerPayoutHistory, containerSettlementHistory, containerCompletedTrips, containerMyFeedbacks;
    private TextView tvAvailableEarnings, tvHeroUpi, tvPayoutLimits, tvTotalCommission, tvPaidByAdmin;
    private TextView tvCodCashLabel, tvCodCashInHand, tvCodDepositLimits, tvTotalCodCollected, tvSettledToAdmin, tvRatingsSummary;
    private TextView tvHelplineHours;
    private Button btnCallHub, btnWaHub;
    private EditText etProfName, etProfEmail, etProfPhone, etProfUpi, etProfVehicle;

    private int activeTabIndex = 0;
    private boolean soundEnabled = true;
    private boolean gpsServiceActive = false;
    private boolean riderApproved = false, riderOnline = false, riderSuspended = false;
    private String riderName = "Gossaigaon Rider", riderPhone = "", riderUpi = "", riderVehicle = "Bike";
    private double riderLat = 26.4524, riderLng = 89.9723;

    private String adminUpiId = "gossaigaonbazar@apl";
    private String supportPhone = "", supportWhatsapp = "";
    private double baseRiderFee = 25, maxCashLimit = 3000;
    private double minRiderPayout = 10, maxRiderPayout = 10000;
    private double minRiderCodDeposit = 10, maxRiderCodDeposit = 25000;
    private long acceptTimeoutSec = 45;
    private boolean allowRiderPass = true, allowRiderSos = true;

    private double netCashInHand = 0, availablePayoutBalance = 0;
    private int prevActiveCount = -1;

    private final Map<String, TripHelper.StoreData> storesMap = new HashMap<>();
    private final List<TripHelper.OrderData> myActiveOrders = new ArrayList<>();
    private final List<TripHelper.OrderData> myCompletedOrders = new ArrayList<>();
    private final List<String> allExistingUtrs = new ArrayList<>();
    private final Map<String, TextView> timerViews = new HashMap<>();
    private final Set<String> timedOutTrips = new HashSet<>();
    private final Map<String, Integer> pinFailCounts = new HashMap<>();
    private final Map<String, Long> pinLockUntil = new HashMap<>();

    private double approvedSettlementsTotal = 0, paidPayoutsTotal = 0;
    private final Handler timerHandler = new Handler(Looper.getMainLooper());

    private final Runnable countdownTask = new Runnable() {
        @Override
        public void run() {
            updateAcceptTimers();
            timerHandler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mAuth = FirebaseAuth.getInstance();
        currentUser = mAuth.getCurrentUser();
        if (currentUser == null) {
            startActivity(new Intent(this, AuthActivity.class));
            finish();
            return;
        }
        db = FirebaseDatabase.getInstance().getReference();
        setContentView(R.layout.activity_main);

        bindViews();
        setupNavAndClicks();
        requestLocationPermissions();
        attachFirebaseListeners();
        timerHandler.post(countdownTask);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (activeTabIndex != 0) {
                    switchTab(0);
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    private void bindViews() {
        tvSuspendedBanner = findViewById(R.id.tvSuspendedBanner);
        tvPersonalNotice = findViewById(R.id.tvPersonalNotice);
        tvBroadcastBanner = findViewById(R.id.tvBroadcastBanner);
        tvApprovalBanner = findViewById(R.id.tvApprovalBanner);
        tvCashLimitBanner = findViewById(R.id.tvCashLimitBanner);

        tvRiderName = findViewById(R.id.tvRiderName);
        tvRiderVehicle = findViewById(R.id.tvRiderVehicle);
        tvRiderRating = findViewById(R.id.tvRiderRating);
        btnSoundToggle = findViewById(R.id.btnSoundToggle);
        dotOnline = findViewById(R.id.dotOnline);
        tvDutyLabel = findViewById(R.id.tvDutyLabel);
        layoutGpsBar = findViewById(R.id.layoutGpsBar);
        tvGpsSyncTime = findViewById(R.id.tvGpsSyncTime);
        tvActiveCount = findViewById(R.id.tvActiveCount);

        scrollActive = findViewById(R.id.scrollActive);
        scrollEarnings = findViewById(R.id.scrollEarnings);
        scrollProfile = findViewById(R.id.scrollProfile);
        tvNavActive = findViewById(R.id.tvNavActive);
        tvNavEarnings = findViewById(R.id.tvNavEarnings);
        tvNavProfile = findViewById(R.id.tvNavProfile);

        containerActiveTrips = findViewById(R.id.containerActiveTrips);
        containerRatings = findViewById(R.id.containerRatings);
        containerPayoutHistory = findViewById(R.id.containerPayoutHistory);
        containerSettlementHistory = findViewById(R.id.containerSettlementHistory);
        containerCompletedTrips = findViewById(R.id.containerCompletedTrips);
        containerMyFeedbacks = findViewById(R.id.containerMyFeedbacks);

        tvAvailableEarnings = findViewById(R.id.tvAvailableEarnings);
        tvHeroUpi = findViewById(R.id.tvHeroUpi);
        tvPayoutLimits = findViewById(R.id.tvPayoutLimits);
        tvTotalCommission = findViewById(R.id.tvTotalCommission);
        tvPaidByAdmin = findViewById(R.id.tvPaidByAdmin);
        tvCodCashLabel = findViewById(R.id.tvCodCashLabel);
        tvCodCashInHand = findViewById(R.id.tvCodCashInHand);
        tvCodDepositLimits = findViewById(R.id.tvCodDepositLimits);
        tvTotalCodCollected = findViewById(R.id.tvTotalCodCollected);
        tvSettledToAdmin = findViewById(R.id.tvSettledToAdmin);
        tvRatingsSummary = findViewById(R.id.tvRatingsSummary);

        tvHelplineHours = findViewById(R.id.tvHelplineHours);
        btnCallHub = findViewById(R.id.btnCallHub);
        btnWaHub = findViewById(R.id.btnWaHub);

        etProfName = findViewById(R.id.etProfName);
        etProfEmail = findViewById(R.id.etProfEmail);
        etProfPhone = findViewById(R.id.etProfPhone);
        etProfUpi = findViewById(R.id.etProfUpi);
        etProfVehicle = findViewById(R.id.etProfVehicle);
    }

    private void setupNavAndClicks() {
        findViewById(R.id.navActive).setOnClickListener(v -> switchTab(0));
        findViewById(R.id.navEarnings).setOnClickListener(v -> switchTab(1));
        findViewById(R.id.navProfile).setOnClickListener(v -> switchTab(2));

        btnSoundToggle.setOnClickListener(v -> {
            soundEnabled = !soundEnabled;
            btnSoundToggle.setText(soundEnabled ? "🔊" : "🔇");
            toast(soundEnabled ? "Trip alert sound ON" : "Trip alert sound MUTED");
        });

        findViewById(R.id.btnDutyToggle).setOnClickListener(v -> toggleDuty());
        findViewById(R.id.btnWithdrawEarnings).setOnClickListener(v -> showWithdrawDialog());
        findViewById(R.id.btnDepositCod).setOnClickListener(v -> showDepositDialog());
        findViewById(R.id.btnSendFeedback).setOnClickListener(v -> showFeedbackDialog());
        findViewById(R.id.btnSaveProfile).setOnClickListener(v -> saveProfile());
        findViewById(R.id.btnLogout).setOnClickListener(v -> logoutRider());

        btnCallHub.setOnClickListener(v -> {
            if (!supportPhone.isEmpty()) startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + supportPhone)));
        });
        btnWaHub.setOnClickListener(v -> {
            String digits = (supportWhatsapp.isEmpty() ? supportPhone : supportWhatsapp).replaceAll("\\D", "");
            if (digits.length() == 10) digits = "91" + digits;
            if (!digits.isEmpty()) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + digits)));
        });
    }

    private void switchTab(int idx) {
        activeTabIndex = idx;
        scrollActive.setVisibility(idx == 0 ? View.VISIBLE : View.GONE);
        scrollEarnings.setVisibility(idx == 1 ? View.VISIBLE : View.GONE);
        scrollProfile.setVisibility(idx == 2 ? View.VISIBLE : View.GONE);

        tvNavActive.setTextColor(idx == 0 ? Color.parseColor("#16A34A") : Color.parseColor("#94A3B8"));
        tvNavEarnings.setTextColor(idx == 1 ? Color.parseColor("#16A34A") : Color.parseColor("#94A3B8"));
        tvNavProfile.setTextColor(idx == 2 ? Color.parseColor("#16A34A") : Color.parseColor("#94A3B8"));
    }

    private void requestLocationPermissions() {
        List<String> list = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            list.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            list.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            list.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!list.isEmpty()) {
            ActivityCompat.requestPermissions(this, list.toArray(new String[0]), REQ_PERMS);
        } else {
            promptBackgroundPermission();
        }
    }

    private void promptBackgroundPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            new AlertDialog.Builder(this)
                    .setTitle("Background GPS Permission")
                    .setMessage("Screen off hone par bhi 5 second live location update ke liye Location permission ko 'Allow all the time' par set karein.")
                    .setPositiveButton("Settings", (d, w) -> {
                        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.fromParts("package", getPackageName(), null));
                        startActivity(intent);
                    })
                    .setNegativeButton("Later", null)
                    .show();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMS && riderOnline && !riderSuspended) {
            startGpsService();
            promptBackgroundPermission();
        }
    }

    private void startGpsService() {
        if (gpsServiceActive) return;
        boolean hasLoc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!hasLoc) return;
        gpsServiceActive = true;
        Intent i = new Intent(this, LocationForegroundService.class);
        i.setAction(LocationForegroundService.ACTION_START);
        ContextCompat.startForegroundService(this, i);
    }

    private void stopGpsService() {
        if (!gpsServiceActive) return;
        gpsServiceActive = false;
        Intent i = new Intent(this, LocationForegroundService.class);
        i.setAction(LocationForegroundService.ACTION_STOP);
        startService(i);
    }

    private void attachFirebaseListeners() {
        final String uid = currentUser.getUid();

        db.child("deliveryPartners").child(uid).addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot s) {
                riderName = TripHelper.getStr(s, "name", "Gossaigaon Rider");
                riderPhone = TripHelper.getStr(s, "phone", "");
                riderUpi = TripHelper.getStr(s, "upiId", "");
                riderVehicle = TripHelper.getStr(s, "vehicle", "Bike");
                riderApproved = TripHelper.getBool(s, "approved", false);
                riderOnline = TripHelper.getBool(s, "online", false);
                riderSuspended = TripHelper.getBool(s, "suspended", false);
                riderLat = TripHelper.getDouble(s, "lat", 26.4524);
                riderLng = TripHelper.getDouble(s, "lng", 89.9723);

                String adminNote = TripHelper.getStr(s, "adminNote", "");
                long lastLoc = TripHelper.getLong(s, "lastLocationUpdate", 0);
                double ratingAvg = TripHelper.getDouble(s, "ratingAvg", 5.0);
                long ratingCount = TripHelper.getLong(s, "ratingCount", 0);

                tvRiderName.setText(riderName);
                tvRiderVehicle.setText(riderVehicle);
                String rTxt = ratingCount > 0 ? String.format(Locale.US, "⭐ %.1f (%d)", ratingAvg, ratingCount) : "⭐ New";
                tvRiderRating.setText(rTxt);
                tvRatingsSummary.setText(rTxt + " • Customer Ratings");

                tvSuspendedBanner.setVisibility(riderSuspended ? View.VISIBLE : View.GONE);
                tvApprovalBanner.setVisibility(riderApproved ? View.GONE : View.VISIBLE);
                if (!adminNote.isEmpty()) {
                    tvPersonalNotice.setText("ADMIN MESSAGE: " + adminNote);
                    tvPersonalNotice.setVisibility(View.VISIBLE);
                } else {
                    tvPersonalNotice.setVisibility(View.GONE);
                }

                if (riderOnline && !riderSuspended) {
                    dotOnline.setBackgroundColor(Color.parseColor("#16A34A"));
                    tvDutyLabel.setText("Online");
                    layoutGpsBar.setVisibility(View.VISIBLE);
                    if (lastLoc > 0) {
                        tvGpsSyncTime.setText("Synced " + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date(lastLoc)));
                    }
                    startGpsService();
                } else {
                    dotOnline.setBackgroundColor(Color.parseColor("#EF4444"));
                    tvDutyLabel.setText("Offline");
                    layoutGpsBar.setVisibility(View.GONE);
                    stopGpsService();
                }

                tvHeroUpi.setText("Payout UPI: " + (riderUpi.isEmpty() ? "Not Set" : riderUpi));
                setIfUnfocused(etProfName, riderName);
                setIfUnfocused(etProfEmail, currentUser.getEmail() != null ? currentUser.getEmail() : "");
                setIfUnfocused(etProfPhone, riderPhone);
                setIfUnfocused(etProfUpi, riderUpi);
                setIfUnfocused(etProfVehicle, riderVehicle);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("restaurants").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                storesMap.clear();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    TripHelper.StoreData st = new TripHelper.StoreData();
                    st.id = ds.getKey();
                    st.name = TripHelper.getStr(ds, "name", "Store");
                    st.address = TripHelper.getStr(ds, "address", "Gossaigaon Bazar");
                    st.phone = TripHelper.getStr(ds, "phone", "");
                    st.lat = TripHelper.getDouble(ds, "lat", 26.4524);
                    st.lng = TripHelper.getDouble(ds, "lng", 89.9723);
                    storesMap.put(st.id, st);
                }
                renderTripsUI();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("admin/settings").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot s) {
                adminUpiId = TripHelper.getStr(s, "upiId", "gossaigaonbazar@apl");
                double rFee = TripHelper.getDouble(s, "riderBaseFee", 0);
                baseRiderFee = rFee > 0 ? rFee : TripHelper.getDouble(s, "deliveryCharge", 25);
                maxCashLimit = TripHelper.getDouble(s, "maxRiderCashLimit", 3000);
                acceptTimeoutSec = Math.max(15, TripHelper.getLong(s, "riderAcceptTimeoutSec", 45));
                minRiderPayout = TripHelper.getDouble(s, "minRiderPayout", 10);
                maxRiderPayout = TripHelper.getDouble(s, "maxRiderPayout", 10000);
                minRiderCodDeposit = TripHelper.getDouble(s, "minRiderCodDeposit", 10);
                maxRiderCodDeposit = TripHelper.getDouble(s, "maxRiderCodDeposit", 25000);
                allowRiderPass = TripHelper.getBool(s, "allowRiderPassTrip", true);
                allowRiderSos = TripHelper.getBool(s, "allowRiderSos", true);

                String ann = TripHelper.getStr(s, "riderAnnouncement", "");
                if (!ann.isEmpty()) {
                    tvBroadcastBanner.setText("ADMIN NOTICE: " + ann);
                    tvBroadcastBanner.setVisibility(View.VISIBLE);
                } else {
                    tvBroadcastBanner.setVisibility(View.GONE);
                }

                supportPhone = TripHelper.getStr(s, "supportPhone", "");
                supportWhatsapp = TripHelper.getStr(s, "supportWhatsapp", "");
                String hrs = TripHelper.getStr(s, "supportHours", "");
                tvHelplineHours.setText(hrs.isEmpty() ? "Need hub assistance?" : "Hours: " + hrs);
                btnCallHub.setVisibility(supportPhone.isEmpty() ? View.GONE : View.VISIBLE);
                btnWaHub.setVisibility((supportWhatsapp.isEmpty() && supportPhone.isEmpty()) ? View.GONE : View.VISIBLE);

                tvPayoutLimits.setText(String.format(Locale.US, "Limits: ₹%.0f - ₹%.0f", minRiderPayout, maxRiderPayout));
                tvCodCashLabel.setText(String.format(Locale.US, "ADMIN COD CASH IN HAND (MAX ₹%.0f)", maxCashLimit));
                tvCodDepositLimits.setText(String.format(Locale.US, "Deposit Limits: ₹%.0f - ₹%.0f", minRiderCodDeposit, maxRiderCodDeposit));

                recalculateFinancials();
                renderTripsUI();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("orders").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                myActiveOrders.clear();
                myCompletedOrders.clear();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    if (!uid.equals(TripHelper.getStr(ds, "deliveryUid", ""))) continue;
                    TripHelper.OrderData o = parseOrder(ds);
                    if ("DELIVERED".equals(o.status) || "CANCELLED".equals(o.status)) {
                        myCompletedOrders.add(o);
                    } else {
                        myActiveOrders.add(o);
                    }
                }

                if (prevActiveCount != -1 && myActiveOrders.size() > prevActiveCount) {
                    playAlertChime();
                    toast("🔔 New grocery trip assigned!");
                }
                prevActiveCount = myActiveOrders.size();

                recalculateFinancials();
                renderTripsUI();
                renderCompletedTripsUI();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("settlements").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                allExistingUtrs.clear();
                approvedSettlementsTotal = 0;
                containerSettlementHistory.removeAllViews();
                List<DataSnapshot> mine = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    String utr = TripHelper.getStr(ds, "utr", "");
                    if (!utr.isEmpty()) allExistingUtrs.add(utr);
                    if (uid.equals(TripHelper.getStr(ds, "riderUid", ""))) {
                        mine.add(ds);
                        if ("APPROVED".equals(TripHelper.getStr(ds, "status", ""))) {
                            approvedSettlementsTotal += TripHelper.getDouble(ds, "amount", 0);
                        }
                    }
                }
                Collections.reverse(mine);
                if (mine.isEmpty()) {
                    containerSettlementHistory.addView(makeEmptyText("No COD handover requests yet."));
                } else {
                    for (DataSnapshot ds : mine) {
                        String st = TripHelper.getStr(ds, "status", "PENDING");
                        containerSettlementHistory.addView(makeLogRow(
                                String.format(Locale.US, "₹%.2f", TripHelper.getDouble(ds, "amount", 0)),
                                TripHelper.getStr(ds, "mode", "") + " • " + TripHelper.getStr(ds, "utr", ""),
                                st, "APPROVED".equals(st) ? "#10B981" : "#F59E0B"
                        ));
                    }
                }
                recalculateFinancials();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("riderPayouts").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                paidPayoutsTotal = 0;
                containerPayoutHistory.removeAllViews();
                List<DataSnapshot> mine = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    if (uid.equals(TripHelper.getStr(ds, "riderUid", ""))) {
                        mine.add(ds);
                        if ("PAID".equals(TripHelper.getStr(ds, "status", ""))) {
                            paidPayoutsTotal += TripHelper.getDouble(ds, "amount", 0);
                        }
                    }
                }
                Collections.reverse(mine);
                if (mine.isEmpty()) {
                    containerPayoutHistory.addView(makeEmptyText("No payout requests yet."));
                } else {
                    for (DataSnapshot ds : mine) {
                        String st = TripHelper.getStr(ds, "status", "PENDING");
                        String ref = TripHelper.getStr(ds, "adminRef", "");
                        containerPayoutHistory.addView(makeLogRow(
                                String.format(Locale.US, "₹%.2f", TripHelper.getDouble(ds, "amount", 0)),
                                "UPI: " + TripHelper.getStr(ds, "riderUpiId", "") + (ref.isEmpty() ? "" : " • Ref: " + ref),
                                st, "PAID".equals(st) ? "#10B981" : "#F59E0B"
                        ));
                    }
                }
                recalculateFinancials();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("riderRatings").child(uid).addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                containerRatings.removeAllViews();
                List<DataSnapshot> list = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) list.add(ds);
                Collections.reverse(list);
                if (list.isEmpty()) {
                    containerRatings.addView(makeEmptyText("No customer ratings yet."));
                    return;
                }
                int limit = Math.min(10, list.size());
                for (int i = 0; i < limit; i++) {
                    DataSnapshot ds = list.get(i);
                    long stars = TripHelper.getLong(ds, "rating", 5);
                    String comment = TripHelper.getStr(ds, "comment", "");
                    containerRatings.addView(makeLogRow(
                            TripHelper.getStr(ds, "customerName", "Customer"),
                            comment.isEmpty() ? "Rated delivery" : comment,
                            "⭐ " + stars, "#FBBF24"
                    ));
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("feedbacks").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                containerMyFeedbacks.removeAllViews();
                List<DataSnapshot> mine = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    if (uid.equals(TripHelper.getStr(ds, "uid", ""))) mine.add(ds);
                }
                Collections.reverse(mine);
                int limit = Math.min(3, mine.size());
                for (int i = 0; i < limit; i++) {
                    DataSnapshot ds = mine.get(i);
                    String st = TripHelper.getStr(ds, "status", "OPEN");
                    String reply = TripHelper.getStr(ds, "adminReply", "");
                    containerMyFeedbacks.addView(makeLogRow(
                            TripHelper.getStr(ds, "subject", "Ticket"),
                            reply.isEmpty() ? TripHelper.getStr(ds, "message", "") : "Admin: " + reply,
                            st, "RESOLVED".equals(st) ? "#10B981" : "#F59E0B"
                    ));
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });
    }

    private TripHelper.OrderData parseOrder(DataSnapshot ds) {
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

    private List<TripHelper.TripGroup> groupOrders(List<TripHelper.OrderData> source) {
        Map<String, TripHelper.TripGroup> map = new LinkedHashMap<>();
        for (TripHelper.OrderData o : source) {
            String key = !o.batchGroupId.isEmpty() ? o.batchGroupId : (o.customerUid + "_" + (!o.deliveryOtp.isEmpty() ? o.deliveryOtp : o.createdAt));
            TripHelper.TripGroup g = map.get(key);
            if (g == null) {
                g = new TripHelper.TripGroup();
                g.tripId = key;
                g.customerUid = o.customerUid;
                g.phone = o.phone;
                g.address = o.address;
                g.customerLat = o.customerLat;
                g.customerLng = o.customerLng;
                g.locationLink = o.locationLink;
                g.deliveryOtp = o.deliveryOtp;
                g.paymentMode = o.paymentMode;
                g.assignedAt = o.assignedAt;
                map.put(key, g);
            }
            g.orders.add(o);
        }
        return new ArrayList<>(map.values());
    }

    private void renderTripsUI() {
        containerActiveTrips.removeAllViews();
        timerViews.clear();
        List<TripHelper.TripGroup> trips = groupOrders(myActiveOrders);
        tvActiveCount.setText(trips.size() + " Active");

        if (trips.isEmpty()) {
            containerActiveTrips.addView(makeEmptyText("No active trips in queue.\nTurn Online to receive nearest store dispatches!"));
            return;
        }
        for (TripHelper.TripGroup trip : trips) {
            containerActiveTrips.addView(buildTripCard(trip));
        }
    }

    private View buildTripCard(final TripHelper.TripGroup trip) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(14);
        card.setLayoutParams(lp);
        card.setBackgroundColor(Color.parseColor("#0F172A"));

        boolean isAccepted = true;
        double totalBill = 0, totalFee = 0;
        StringBuilder itemsSummary = new StringBuilder();
        for (TripHelper.OrderData o : trip.orders) {
            if (!Boolean.TRUE.equals(o.riderAccepted)) isAccepted = false;
            totalBill += o.totalAmount;
            totalFee += (o.deliveryCharge > 0 ? o.deliveryCharge : baseRiderFee);
            for (TripHelper.OrderItem it : o.items) {
                if (itemsSummary.length() > 0) itemsSummary.append(", ");
                itemsSummary.append(it.qty).append("x ").append(it.name);
            }
        }
        final boolean hasPickedUp = TripHelper.isTripPickedUp(trip);
        final boolean isPrepaid = "WALLET".equals(trip.paymentMode) || ("UPI".equals(trip.paymentMode) && allUpiVerified(trip));

        TextView title = new TextView(this);
        title.setText((trip.orders.size() > 1 ? "🏪 " + trip.orders.size() + "-STORES COMBO" : "🛵 SINGLE STORE TRIP")
                + "  •  #" + shortId(trip.tripId)
                + (isAccepted ? "" : "  [ACCEPT REQUIRED]"));
        title.setTextColor(Color.parseColor(isAccepted ? "#38BDF8" : "#FBBF24"));
        title.setTextSize(15);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        card.addView(title);

        TextView earn = new TextView(this);
        earn.setText(String.format(Locale.US, "Earning: +₹%.0f  |  %s: ₹%.0f", totalFee,
                isPrepaid ? trip.paymentMode + " Paid" : ("UPI".equals(trip.paymentMode) ? "UPI Unverified" : "COD"), totalBill));
        earn.setTextColor(Color.parseColor("#10B981"));
        earn.setTextSize(13);
        earn.setTypeface(null, android.graphics.Typeface.BOLD);
        earn.setPadding(0, dp(4), 0, dp(8));
        card.addView(earn);

        if (!isAccepted) {
            TextView tvTimer = new TextView(this);
            tvTimer.setTextColor(Color.parseColor("#F59E0B"));
            tvTimer.setTextSize(12);
            tvTimer.setTypeface(null, android.graphics.Typeface.BOLD);
            card.addView(tvTimer);
            timerViews.put(trip.tripId, tvTimer);

            for (int i = 0; i < trip.orders.size(); i++) {
                TripHelper.OrderData o = trip.orders.get(i);
                TripHelper.StoreData st = storesMap.get(o.restaurantId);
                String stName = st != null ? st.name : "Store";
                double dist = st != null ? TripHelper.calculateDistanceKm(riderLat, riderLng, st.lat, st.lng) : -1;
                TextView stTv = new TextView(this);
                stTv.setText("• Store " + (i + 1) + ": " + stName + (dist >= 0 ? String.format(Locale.US, " (~%.1f km)", dist) : ""));
                stTv.setTextColor(Color.parseColor("#CBD5E1"));
                stTv.setTextSize(12);
                card.addView(stTv);
            }

            TextView itTv = new TextView(this);
            itTv.setText("Items: " + itemsSummary);
            itTv.setTextColor(Color.parseColor("#94A3B8"));
            itTv.setTextSize(12);
            itTv.setPadding(0, dp(6), 0, dp(10));
            card.addView(itTv);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            if (allowRiderPass && !hasPickedUp) {
                Button bPass = makeBtn("Pass", "#7F1D1D", "#FCA5A5");
                bPass.setOnClickListener(v -> passTripToNextRider(trip, "Rider declined"));
                row.addView(bPass, new LinearLayout.LayoutParams(0, dp(44), 1f));
            }
            Button bAccept = makeBtn(String.format(Locale.US, "Accept (+₹%.0f)", totalFee), "#16A34A", "#FFFFFF");
            LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(44), 1.5f);
            ap.leftMargin = dp(8);
            row.addView(bAccept, ap);
            bAccept.setOnClickListener(v -> acceptTrip(trip));
            card.addView(row);
            return card;
        }

        List<TripHelper.OrderData> sortedStops = new ArrayList<>(trip.orders);
        Collections.sort(sortedStops, (a, b) -> {
            boolean pa = "PICKED_UP".equals(a.status) || "OUT_FOR_DELIVERY".equals(a.status);
            boolean pb = "PICKED_UP".equals(b.status) || "OUT_FOR_DELIVERY".equals(b.status);
            if (pa != pb) return pa ? 1 : -1;
            TripHelper.StoreData sa = storesMap.get(a.restaurantId);
            TripHelper.StoreData sb = storesMap.get(b.restaurantId);
            double da = sa != null ? TripHelper.calculateDistanceKm(riderLat, riderLng, sa.lat, sa.lng) : 999;
            double dbDist = sb != null ? TripHelper.calculateDistanceKm(riderLat, riderLng, sb.lat, sb.lng) : 999;
            return Double.compare(da, dbDist);
        });

        boolean allPickedUp = true;
        boolean shownActiveStore = false;
        for (int i = 0; i < sortedStops.size(); i++) {
            final TripHelper.OrderData o = sortedStops.get(i);
            boolean isPicked = "PICKED_UP".equals(o.status) || "OUT_FOR_DELIVERY".equals(o.status);
            TripHelper.StoreData st = storesMap.get(o.restaurantId);
            String stName = st != null ? st.name : "Store";
            String stAddr = st != null ? st.address : "Gossaigaon Bazar";
            String stPhone = st != null ? st.phone : "";

            LinearLayout stopBox = new LinearLayout(this);
            stopBox.setOrientation(LinearLayout.VERTICAL);
            stopBox.setPadding(dp(10), dp(10), dp(10), dp(10));
            LinearLayout.LayoutParams sbp = new LinearLayout.LayoutParams(-1, -2);
            sbp.bottomMargin = dp(8);
            stopBox.setLayoutParams(sbp);

            if (isPicked) {
                stopBox.setBackgroundColor(Color.parseColor("#064E3B"));
                TextView t = new TextView(this);
                t.setText("✅ STOP " + (i + 1) + ": PICKED UP - " + stName);
                t.setTextColor(Color.parseColor("#34D399"));
                t.setTextSize(12);
                t.setTypeface(null, android.graphics.Typeface.BOLD);
                stopBox.addView(t);
            } else {
                allPickedUp = false;
                if (!shownActiveStore) {
                    shownActiveStore = true;
                    stopBox.setBackgroundColor(Color.parseColor("#172238"));
                    double d = st != null ? TripHelper.calculateDistanceKm(riderLat, riderLng, st.lat, st.lng) : -1;
                    TextView t = new TextView(this);
                    t.setText("📍 STOP " + (i + 1) + " PICKUP: " + stName + (d >= 0 ? String.format(Locale.US, " (~%.1f km)", d) : ""));
                    t.setTextColor(Color.parseColor("#60A5FA"));
                    t.setTextSize(13);
                    t.setTypeface(null, android.graphics.Typeface.BOLD);
                    stopBox.addView(t);

                    TextView addrTv = new TextView(this);
                    addrTv.setText(stAddr + "\n📦 Store Pickup Code: [ " + TripHelper.getStorePickupCode(o) + " ]");
                    addrTv.setTextColor(Color.parseColor("#E2E8F0"));
                    addrTv.setTextSize(12);
                    addrTv.setPadding(0, dp(4), 0, dp(6));
                    stopBox.addView(addrTv);

                    LinearLayout linkRow = new LinearLayout(this);
                    linkRow.setOrientation(LinearLayout.HORIZONTAL);
                    Button bMap = makeBtn("Store Maps", "#1D4ED8", "#FFFFFF");
                    bMap.setOnClickListener(v -> openGoogleMaps(st != null ? st.lat : 26.4524, st != null ? st.lng : 89.9723, stName));
                    linkRow.addView(bMap, new LinearLayout.LayoutParams(0, dp(38), 1f));
                    if (!stPhone.isEmpty()) {
                        Button bCall = makeBtn("Call Store", "#202D45", "#FFFFFF");
                        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(38), 1f);
                        cp.leftMargin = dp(6);
                        bCall.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + stPhone))));
                        linkRow.addView(bCall, cp);
                    }
                    stopBox.addView(linkRow);

                    if ("READY_FOR_PICKUP".equals(o.status)) {
                        Button bPick = makeBtn("Confirm Picked Up", "#16A34A", "#FFFFFF");
                        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-1, dp(44));
                        pp.topMargin = dp(8);
                        bPick.setOnClickListener(v -> confirmStorePickup(o.orderId));
                        stopBox.addView(bPick, pp);
                    } else {
                        TextView waitTv = new TextView(this);
                        waitTv.setText("⏳ Waiting for Store Ready (" + o.status + ")");
                        waitTv.setTextColor(Color.parseColor("#F59E0B"));
                        waitTv.setTextSize(12);
                        waitTv.setPadding(0, dp(6), 0, 0);
                        stopBox.addView(waitTv);
                    }
                } else {
                    stopBox.setBackgroundColor(Color.parseColor("#090E1A"));
                    TextView t = new TextView(this);
                    t.setText("🔒 STOP " + (i + 1) + ": NEXT STORE - " + stName);
                    t.setTextColor(Color.parseColor("#64748B"));
                    t.setTextSize(12);
                    stopBox.addView(t);
                }
            }
            card.addView(stopBox);
        }

        if (allPickedUp) {
            LinearLayout custBox = new LinearLayout(this);
            custBox.setOrientation(LinearLayout.VERTICAL);
            custBox.setBackgroundColor(Color.parseColor("#064E3B"));
            custBox.setPadding(dp(10), dp(10), dp(10), dp(10));

            double cDist = TripHelper.calculateDistanceKm(riderLat, riderLng, trip.customerLat, trip.customerLng);
            TextView ct = new TextView(this);
            ct.setText("🏠 DELIVER TO CUSTOMER" + (cDist >= 0 ? String.format(Locale.US, " (~%.1f km)", cDist) : ""));
            ct.setTextColor(Color.parseColor("#34D399"));
            ct.setTextSize(13);
            ct.setTypeface(null, android.graphics.Typeface.BOLD);
            custBox.addView(ct);

            TextView ca = new TextView(this);
            ca.setText(trip.address + (trip.phone.isEmpty() ? "" : "\n📱 " + trip.phone));
            ca.setTextColor(Color.WHITE);
            ca.setTextSize(12);
            ca.setPadding(0, dp(4), 0, dp(8));
            custBox.addView(ca);

            LinearLayout cRow = new LinearLayout(this);
            cRow.setOrientation(LinearLayout.HORIZONTAL);
            Button bCMap = makeBtn("Maps Nav", "#16A34A", "#FFFFFF");
            bCMap.setOnClickListener(v -> openGoogleMaps(trip.customerLat, trip.customerLng, trip.address));
            cRow.addView(bCMap, new LinearLayout.LayoutParams(0, dp(38), 1f));
            if (!trip.phone.isEmpty()) {
                Button bCCall = makeBtn("Call", "#172238", "#FFFFFF");
                LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(38), 0.7f);
                cp.leftMargin = dp(6);
                bCCall.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + trip.phone))));
                cRow.addView(bCCall, cp);
            }
            custBox.addView(cRow);

            boolean isOut = false;
            for (TripHelper.OrderData o : trip.orders) if ("OUT_FOR_DELIVERY".equals(o.status)) isOut = true;

            final double finalBill = totalBill;
            if (!isOut) {
                Button bStart = makeBtn("Start Doorstep Route", "#38BDF8", "#000000");
                LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(46));
                sp.topMargin = dp(8);
                bStart.setOnClickListener(v -> startDoorstepRoute(trip));
                custBox.addView(bStart, sp);
            } else {
                Button bPin = makeBtn("Enter Customer PIN & Complete", "#10B981", "#FFFFFF");
                LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-1, dp(46));
                pp.topMargin = dp(8);
                bPin.setOnClickListener(v -> showPinVerifyDialog(trip, finalBill, isPrepaid));
                custBox.addView(bPin, pp);
            }
            card.addView(custBox);
        }

        LinearLayout bottomRow = new LinearLayout(this);
        bottomRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams brp = new LinearLayout.LayoutParams(-1, -2);
        brp.topMargin = dp(10);
        bottomRow.setLayoutParams(brp);

        if (allowRiderSos) {
            Button bSos = makeBtn("⚠️ Road Issue", "#451A03", "#FBBF24");
            bSos.setOnClickListener(v -> showSosDialog(trip));
            bottomRow.addView(bSos, new LinearLayout.LayoutParams(0, dp(38), 1f));
        }

        if (hasPickedUp) {
            TextView lockTv = new TextView(this);
            lockTv.setText("🔒 Picked Up (Cancel Locked)");
            lockTv.setTextColor(Color.parseColor("#94A3B8"));
            lockTv.setTextSize(11);
            lockTv.setTypeface(null, android.graphics.Typeface.BOLD);
            lockTv.setGravity(android.view.Gravity.CENTER);
            LinearLayout.LayoutParams lpLock = new LinearLayout.LayoutParams(0, dp(38), 1.2f);
            lpLock.leftMargin = dp(8);
            bottomRow.addView(lockTv, lpLock);
        } else if (allowRiderPass) {
            Button bPassTrip = makeBtn("Pass Trip", "#7F1D1D", "#FCA5A5");
            LinearLayout.LayoutParams ptp = new LinearLayout.LayoutParams(0, dp(38), 1f);
            ptp.leftMargin = dp(8);
            bPassTrip.setOnClickListener(v -> showPassTripDialog(trip));
            bottomRow.addView(bPassTrip, ptp);
        }

        card.addView(bottomRow);
        return card;
    }

    private boolean allUpiVerified(TripHelper.TripGroup trip) {
        for (TripHelper.OrderData o : trip.orders) {
            if (!"VERIFIED".equals(o.paymentStatus)) return false;
        }
        return true;
    }

    private void updateAcceptTimers() {
        long now = System.currentTimeMillis();
        for (TripHelper.TripGroup trip : groupOrders(myActiveOrders)) {
            boolean accepted = true;
            for (TripHelper.OrderData o : trip.orders) if (!Boolean.TRUE.equals(o.riderAccepted)) accepted = false;
            if (accepted || TripHelper.isTripPickedUp(trip)) continue;

            long elapsed = (now - trip.assignedAt) / 1000L;
            long rem = Math.max(0, acceptTimeoutSec - elapsed);
            TextView tv = timerViews.get(trip.tripId);
            if (tv != null) tv.setText("⏳ Auto-Pass in: " + rem + "s");
            if (rem <= 0 && !timedOutTrips.contains(trip.tripId)) {
                timedOutTrips.add(trip.tripId);
                passTripToNextRider(trip, "Auto-Timeout (" + acceptTimeoutSec + "s)");
            }
        }
    }

    private void acceptTrip(TripHelper.TripGroup trip) {
        if (riderSuspended) { toast("Account suspended!"); return; }
        long now = System.currentTimeMillis();
        for (TripHelper.OrderData o : trip.orders) {
            Map<String, Object> up = new HashMap<>();
            up.put("riderAccepted", true);
            up.put("riderAcceptedAt", now);
            up.put("riderLat", riderLat);
            up.put("riderLng", riderLng);
            up.put("lastLocationUpdate", now);
            up.put("updatedAt", now);
            db.child("orders").child(o.orderId).updateChildren(up);
        }
        toast("🎉 Trip Accepted!");
    }

    private void confirmStorePickup(String orderId) {
        long now = System.currentTimeMillis();
        Map<String, Object> up = new HashMap<>();
        up.put("status", "PICKED_UP");
        up.put("storePickupVerifiedAt", now);
        up.put("riderLat", riderLat);
        up.put("riderLng", riderLng);
        up.put("lastLocationUpdate", now);
        up.put("updatedAt", now);
        db.child("orders").child(orderId).updateChildren(up);
        toast("✅ Order Picked Up! Cancel/Pass ab lock ho gaya hai.");
    }

    private void startDoorstepRoute(TripHelper.TripGroup trip) {
        long now = System.currentTimeMillis();
        for (TripHelper.OrderData o : trip.orders) {
            Map<String, Object> up = new HashMap<>();
            up.put("status", "OUT_FOR_DELIVERY");
            up.put("riderLat", riderLat);
            up.put("riderLng", riderLng);
            up.put("lastLocationUpdate", now);
            up.put("updatedAt", now);
            db.child("orders").child(o.orderId).updateChildren(up);
        }
        toast("🛵 Doorstep route started!");
    }

    private void passTripToNextRider(final TripHelper.TripGroup trip, final String reason) {
        if (TripHelper.isTripPickedUp(trip)) {
            toast("🔒 Store se pickup ke baad order cancel/pass nahi ho sakta!");
            return;
        }
        toast("Nearest rider to store dhoondh rahe hain...");
        db.child("deliveryPartners").addListenerForSingleValueEvent(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                TripHelper.StoreData st = storesMap.get(trip.orders.get(0).restaurantId);
                double sLat = st != null ? st.lat : riderLat;
                double sLng = st != null ? st.lng : riderLng;

                String nextUid = null, fallbackUid = null;
                double minDist = Double.MAX_VALUE;
                String myUid = currentUser.getUid();

                for (DataSnapshot ds : snapshot.getChildren()) {
                    String uid = ds.getKey();
                    if (uid == null || uid.equals(myUid)) continue;
                    boolean app = TripHelper.getBool(ds, "approved", false);
                    boolean on = TripHelper.getBool(ds, "online", false);
                    boolean susp = TripHelper.getBool(ds, "suspended", false);
                    if (!app || !on || susp) continue;

                    boolean alreadyRejected = false;
                    for (TripHelper.OrderData o : trip.orders) {
                        if (o.rejectedRiderUids.contains(uid)) { alreadyRejected = true; break; }
                    }
                    if (alreadyRejected) continue;

                    double rLat = TripHelper.getDouble(ds, "lat", 0);
                    double rLng = TripHelper.getDouble(ds, "lng", 0);
                    if (rLat != 0 && rLng != 0) {
                        double d = TripHelper.calculateDistanceKm(sLat, sLng, rLat, rLng);
                        if (d >= 0 && d < minDist) {
                            minDist = d;
                            nextUid = uid;
                        }
                    } else if (fallbackUid == null) {
                        fallbackUid = uid;
                    }
                }
                if (nextUid == null) nextUid = fallbackUid;

                long now = System.currentTimeMillis();
                for (TripHelper.OrderData o : trip.orders) {
                    Map<String, Object> up = new HashMap<>();
                    up.put("deliveryUid", nextUid);
                    up.put("riderAccepted", null);
                    up.put("riderAcceptedAt", null);
                    up.put("assignedAt", nextUid != null ? now : null);
                    up.put("updatedAt", now);

                    Map<String, Object> rej = new HashMap<>();
                    rej.put("riderName", riderName);
                    rej.put("riderPhone", riderPhone);
                    rej.put("reason", reason);
                    rej.put("timestamp", now);
                    up.put("rejectedByRiders/" + myUid, rej);

                    db.child("orders").child(o.orderId).updateChildren(up);
                }
                toast(nextUid != null ? "⚡ Trip nearest rider ko pass ho gaya!" : "Admin queue me bhej diya gaya.");
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {}
        });
    }

    private void showPassTripDialog(final TripHelper.TripGroup trip) {
        if (!allowRiderPass) { toast("Passing trips disabled by Admin."); return; }
        if (TripHelper.isTripPickedUp(trip)) {
            toast("🔒 Store se pickup ke baad order cancel/pass nahi ho sakta!");
            return;
        }
        String[] reasons = {"Vehicle breakdown / Tyre puncture", "Heavy rainfall / Waterlogging", "Personal emergency / Ending shift", "Customer unreachable"};
        Spinner sp = new Spinner(this);
        sp.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, reasons));
        new AlertDialog.Builder(this)
                .setTitle("Pass Trip #" + shortId(trip.tripId))
                .setView(sp)
                .setPositiveButton("Confirm Pass", (d, w) -> passTripToNextRider(trip, sp.getSelectedItem().toString()))
                .setNegativeButton("Back", null)
                .show();
    }

    private void showSosDialog(final TripHelper.TripGroup trip) {
        String[] reasons = {"🌧️ Heavy rainfall / waterlogging", "🛵 Tyre puncture / breakdown", "🚦 Traffic jam", "📞 Customer gate locked"};
        Spinner sp = new Spinner(this);
        sp.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, reasons));
        new AlertDialog.Builder(this)
                .setTitle("Road Delay / SOS Alert")
                .setView(sp)
                .setPositiveButton("Broadcast Alert", (d, w) -> {
                    long now = System.currentTimeMillis();
                    String msg = "Rider update: " + sp.getSelectedItem().toString();
                    for (TripHelper.OrderData o : trip.orders) {
                        Map<String, Object> up = new HashMap<>();
                        up.put("emergencyAlert", true);
                        up.put("emergencyDetails", msg);
                        up.put("updatedAt", now);
                        db.child("orders").child(o.orderId).updateChildren(up);
                    }
                    toast("⚠️ Delay alert bhej diya gaya!");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showPinVerifyDialog(final TripHelper.TripGroup trip, final double totalBill, final boolean isPrepaid) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(12), dp(20), dp(8));

        final EditText etPin = new EditText(this);
        etPin.setHint("4-Digit Customer PIN");
        etPin.setInputType(InputType.TYPE_CLASS_NUMBER);
        etPin.setTextSize(18);
        box.addView(etPin);

        final TextView tvChange = new TextView(this);
        if (!isPrepaid) {
            TextView tvCod = new TextView(this);
            tvCod.setText(String.format(Locale.US, "COD Cash to Collect: ₹%.2f", totalBill));
            tvCod.setTextSize(15);
            tvCod.setTypeface(null, android.graphics.Typeface.BOLD);
            tvCod.setPadding(0, dp(10), 0, dp(4));
            box.addView(tvCod);

            final EditText etCash = new EditText(this);
            etCash.setHint("Cash Given by Customer (Optional)");
            etCash.setInputType(InputType.TYPE_CLASS_NUMBER);
            box.addView(etCash);
            box.addView(tvChange);

            etCash.addTextChangedListener(new TextWatcher() {
                @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
                @Override public void onTextChanged(CharSequence s, int a, int b, int c) {
                    try {
                        double given = Double.parseDouble(s.toString());
                        double ch = given - totalBill;
                        tvChange.setText(ch >= 0 ? String.format(Locale.US, "Return Change: ₹%.2f", ch) : String.format(Locale.US, "Need ₹%.2f more", Math.abs(ch)));
                    } catch (Exception e) { tvChange.setText(""); }
                }
                @Override public void afterTextChanged(Editable s) {}
            });
        }

        new AlertDialog.Builder(this)
                .setTitle("Verify PIN & Complete Trip")
                .setView(box)
                .setPositiveButton("Verify & Complete", (d, w) -> {
                    long lockUntil = pinLockUntil.containsKey(trip.tripId) ? pinLockUntil.get(trip.tripId) : 0L;
                    if (System.currentTimeMillis() < lockUntil) {
                        toast("🔒 Locked! Thodi der baad try karein.");
                        return;
                    }
                    String entered = etPin.getText().toString().trim();
                    if (!trip.deliveryOtp.isEmpty() && !entered.equals(trip.deliveryOtp)) {
                        int fails = (pinFailCounts.containsKey(trip.tripId) ? pinFailCounts.get(trip.tripId) : 0) + 1;
                        if (fails >= 3) {
                            pinLockUntil.put(trip.tripId, System.currentTimeMillis() + 60000L);
                            pinFailCounts.put(trip.tripId, 0);
                            toast("🚨 3 galat attempts! 60s ke liye lock.");
                        } else {
                            pinFailCounts.put(trip.tripId, fails);
                            toast("❌ Galat PIN! (" + (3 - fails) + " attempts left)");
                        }
                        return;
                    }
                    long now = System.currentTimeMillis();
                    for (TripHelper.OrderData o : trip.orders) {
                        Map<String, Object> up = new HashMap<>();
                        up.put("status", "DELIVERED");
                        up.put("updatedAt", now);
                        db.child("orders").child(o.orderId).updateChildren(up);
                    }
                    toast("🎉 PIN Verified! Trip Completed!");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void recalculateFinancials() {
        double codCollected = 0, totalEarned = 0;
        for (TripHelper.OrderData o : myCompletedOrders) {
            if ("DELIVERED".equals(o.status)) {
                totalEarned += (o.deliveryCharge > 0 ? o.deliveryCharge : baseRiderFee);
                if (!"UPI".equals(o.paymentMode) && !"WALLET".equals(o.paymentMode)) {
                    codCollected += o.totalAmount;
                }
            }
        }
        netCashInHand = Math.max(0, codCollected - approvedSettlementsTotal);
        availablePayoutBalance = Math.max(0, totalEarned - paidPayoutsTotal);

        tvAvailableEarnings.setText(String.format(Locale.US, "₹%.2f", availablePayoutBalance));
        tvTotalCommission.setText(String.format(Locale.US, "Total Earned: ₹%.2f", totalEarned));
        tvPaidByAdmin.setText(String.format(Locale.US, "Paid: ₹%.2f", paidPayoutsTotal));
        tvCodCashInHand.setText(String.format(Locale.US, "₹%.2f", netCashInHand));
        tvTotalCodCollected.setText(String.format(Locale.US, "Collected: ₹%.2f", codCollected));
        tvSettledToAdmin.setText(String.format(Locale.US, "Settled: ₹%.2f", approvedSettlementsTotal));
        tvCashLimitBanner.setVisibility(netCashInHand >= maxCashLimit ? View.VISIBLE : View.GONE);
    }

    private void renderCompletedTripsUI() {
        containerCompletedTrips.removeAllViews();
        List<TripHelper.TripGroup> done = groupOrders(myCompletedOrders);
        if (done.isEmpty()) {
            containerCompletedTrips.addView(makeEmptyText("No completed trips yet."));
            return;
        }
        Collections.reverse(done);
        for (TripHelper.TripGroup t : done) {
            double fee = 0;
            for (TripHelper.OrderData o : t.orders) fee += (o.deliveryCharge > 0 ? o.deliveryCharge : baseRiderFee);
            containerCompletedTrips.addView(makeLogRow("#" + shortId(t.tripId), t.address, String.format(Locale.US, "+₹%.0f", fee), "#10B981"));
        }
    }

    private void showWithdrawDialog() {
        if (availablePayoutBalance < minRiderPayout) {
            toast(String.format(Locale.US, "Minimum ₹%.0f balance chahiye!", minRiderPayout));
            return;
        }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(12), dp(20), dp(8));

        final EditText etAmt = new EditText(this);
        etAmt.setInputType(InputType.TYPE_CLASS_NUMBER);
        etAmt.setText(String.valueOf((int) Math.min(Math.floor(availablePayoutBalance), maxRiderPayout)));
        etAmt.setHint("Withdraw Amount (₹)");
        box.addView(etAmt);

        final EditText etUpi = new EditText(this);
        etUpi.setText(riderUpi);
        etUpi.setHint("Your Receiving UPI ID");
        box.addView(etUpi);

        new AlertDialog.Builder(this)
                .setTitle("Withdraw Earnings")
                .setView(box)
                .setPositiveButton("Send Request", (d, w) -> {
                    double amt;
                    try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception e) { amt = 0; }
                    String upi = etUpi.getText().toString().trim();
                    if (amt < minRiderPayout || amt > maxRiderPayout) {
                        toast(String.format(Locale.US, "Limit: ₹%.0f - ₹%.0f", minRiderPayout, maxRiderPayout));
                        return;
                    }
                    if (amt > availablePayoutBalance) { toast("Insufficient balance!"); return; }
                    if (!TripHelper.isValidUpiId(upi)) { toast("Valid UPI ID enter karein!"); return; }

                    Map<String, Object> req = new HashMap<>();
                    req.put("riderUid", currentUser.getUid());
                    req.put("riderName", riderName);
                    req.put("riderPhone", riderPhone);
                    req.put("riderUpiId", upi);
                    req.put("amount", amt);
                    req.put("status", "PENDING");
                    req.put("createdAt", System.currentTimeMillis());
                    db.child("riderPayouts").push().setValue(req);
                    toast("🎉 Payout request Admin ko bhej diya gaya!");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showDepositDialog() {
        if (netCashInHand <= 0) { toast("Koi COD cash deposit karne ko baaki nahi hai!"); return; }
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(12), dp(20), dp(8));

        final EditText etAmt = new EditText(this);
        etAmt.setInputType(InputType.TYPE_CLASS_NUMBER);
        etAmt.setText(String.valueOf((int) Math.min(Math.round(netCashInHand), maxRiderCodDeposit)));
        etAmt.setHint("Deposit Amount (₹)");
        box.addView(etAmt);

        String[] modes = {"UPI", "CASH"};
        final Spinner spMode = new Spinner(this);
        spMode.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, modes));
        box.addView(spMode);

        final EditText etUtr = new EditText(this);
        etUtr.setHint("12-Digit UPI UTR (If UPI)");
        etUtr.setInputType(InputType.TYPE_CLASS_NUMBER);
        box.addView(etUtr);

        Button btnPayUpi = makeBtn("📲 Open UPI App (" + adminUpiId + ")", "#0284C7", "#FFFFFF");
        btnPayUpi.setOnClickListener(v -> {
            double amt = netCashInHand;
            try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception ignored) {}
            String uri = "upi://pay?pa=" + Uri.encode(adminUpiId) + "&pn=GossaigaonBazarAdmin&am=" + String.format(Locale.US, "%.2f", amt) + "&cu=INR";
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(uri))); } catch (Exception e) { toast("UPI App nahi mila"); }
        });
        box.addView(btnPayUpi);

        new AlertDialog.Builder(this)
                .setTitle("Deposit COD Cash to Admin")
                .setView(box)
                .setPositiveButton("Submit Handover", (d, w) -> {
                    double amt;
                    try { amt = Double.parseDouble(etAmt.getText().toString().trim()); } catch (Exception e) { amt = 0; }
                    String mode = spMode.getSelectedItem().toString();
                    String utr = etUtr.getText().toString().trim();
                    if (amt < minRiderCodDeposit || amt > maxRiderCodDeposit) {
                        toast(String.format(Locale.US, "Limit: ₹%.0f - ₹%.0f", minRiderCodDeposit, maxRiderCodDeposit));
                        return;
                    }
                    if (amt > netCashInHand) { toast("Amount cash in hand se zyada hai!"); return; }
                    if ("UPI".equals(mode)) {
                        String err = TripHelper.validateSettlementUtr(utr, allExistingUtrs);
                        if (err != null) { toast(err); return; }
                    }
                    Map<String, Object> s = new HashMap<>();
                    s.put("riderUid", currentUser.getUid());
                    s.put("riderName", riderName);
                    s.put("amount", amt);
                    s.put("mode", mode);
                    s.put("utr", "UPI".equals(mode) ? utr : "PHYSICAL_HANDOVER");
                    s.put("status", "PENDING");
                    s.put("createdAt", System.currentTimeMillis());
                    db.child("settlements").push().setValue(s);
                    toast("🎉 Handover Admin ko bhej diya gaya!");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showFeedbackDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(12), dp(20), dp(8));

        final EditText etSub = new EditText(this);
        etSub.setHint("Subject (e.g. Payout / Route Issue)");
        box.addView(etSub);

        final EditText etMsg = new EditText(this);
        etMsg.setHint("Message");
        box.addView(etMsg);

        new AlertDialog.Builder(this)
                .setTitle("Send Feedback to Admin")
                .setView(box)
                .setPositiveButton("Send", (d, w) -> {
                    String sub = etSub.getText().toString().trim();
                    String msg = etMsg.getText().toString().trim();
                    if (sub.isEmpty() || msg.isEmpty()) { toast("Subject aur Message bharein!"); return; }
                    Map<String, Object> fb = new HashMap<>();
                    fb.put("role", "RIDER");
                    fb.put("uid", currentUser.getUid());
                    fb.put("name", riderName);
                    fb.put("phone", riderPhone);
                    fb.put("subject", sub);
                    fb.put("message", msg);
                    fb.put("status", "OPEN");
                    fb.put("createdAt", System.currentTimeMillis());
                    db.child("feedbacks").push().setValue(fb);
                    toast("💬 Ticket Admin ko bhej diya gaya!");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void toggleDuty() {
        if (riderSuspended) { toast("🚫 Account suspended by Admin!"); return; }
        boolean next = !riderOnline;
        if (next && netCashInHand >= maxCashLimit) {
            toast(String.format(Locale.US, "🛑 Cash Limit ₹%.0f exceeded! Deposit first.", maxCashLimit));
            return;
        }
        Map<String, Object> up = new HashMap<>();
        up.put("online", next);
        up.put("lastSeen", System.currentTimeMillis());
        db.child("deliveryPartners").child(currentUser.getUid()).updateChildren(up);
        toast(next ? "Duty ON: Live 5s GPS Active!" : "Duty OFF: Shift Ended.");
    }

    private void saveProfile() {
        String n = etProfName.getText().toString().trim();
        String p = etProfPhone.getText().toString().trim();
        String u = etProfUpi.getText().toString().trim();
        String v = etProfVehicle.getText().toString().trim();
        if (!TripHelper.isValidIndianMobile(p)) { toast("Valid 10-digit mobile enter karein!"); return; }
        if (!TripHelper.isValidUpiId(u)) { toast("Valid UPI ID enter karein!"); return; }

        Map<String, Object> up = new HashMap<>();
        up.put("name", n);
        up.put("phone", p);
        up.put("upiId", u);
        up.put("vehicle", v);
        up.put("updatedAt", System.currentTimeMillis());
        db.child("deliveryPartners").child(currentUser.getUid()).updateChildren(up);
        toast("✅ Rider profile & UPI ID saved!");
    }

    private void logoutRider() {
        gpsServiceActive = false;
        Intent i = new Intent(this, LocationForegroundService.class);
        i.setAction(LocationForegroundService.ACTION_STOP);
        startService(i);
        db.child("deliveryPartners").child(currentUser.getUid()).child("online").setValue(false);
        mAuth.signOut();
        startActivity(new Intent(this, AuthActivity.class));
        finish();
    }

    private void openGoogleMaps(double lat, double lng, String fallbackQuery) {
        String uri = (lat != 0 && lng != 0)
                ? "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng
                : "https://www.google.com/maps/dir/?api=1&destination=" + Uri.encode(fallbackQuery);
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(uri))); } catch (Exception e) { toast("Google Maps nahi khul saka"); }
    }

    private void playAlertChime() {
        if (!soundEnabled) return;
        try {
            Ringtone r = RingtoneManager.getRingtone(getApplicationContext(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
            if (r != null) r.play();
        } catch (Exception ignored) {}
    }

    private void setIfUnfocused(EditText et, String val) {
        if (!et.hasFocus()) et.setText(val);
    }

    private View makeLogRow(String title, String sub, String badge, String badgeColor) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setBackgroundColor(Color.parseColor("#0F172A"));
        row.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(8);
        row.setLayoutParams(lp);

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        TextView t1 = new TextView(this);
        t1.setText(title);
        t1.setTextColor(Color.WHITE);
        t1.setTextSize(14);
        t1.setTypeface(null, android.graphics.Typeface.BOLD);
        left.addView(t1);

        TextView t2 = new TextView(this);
        t2.setText(sub);
        t2.setTextColor(Color.parseColor("#94A3B8"));
        t2.setTextSize(12);
        left.addView(t2);
        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView right = new TextView(this);
        right.setText(badge);
        right.setTextColor(Color.parseColor(badgeColor));
        right.setTextSize(12);
        right.setTypeface(null, android.graphics.Typeface.BOLD);
        row.addView(right);
        return row;
    }

    private TextView makeEmptyText(String msg) {
        TextView tv = new TextView(this);
        tv.setText(msg);
        tv.setTextColor(Color.parseColor("#94A3B8"));
        tv.setGravity(android.view.Gravity.CENTER);
        tv.setPadding(dp(12), dp(20), dp(12), dp(20));
        return tv;
    }

    private Button makeBtn(String text, String bgHex, String textHex) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(12);
        b.setTypeface(null, android.graphics.Typeface.BOLD);
        b.setTextColor(Color.parseColor(textHex));
        b.setBackgroundColor(Color.parseColor(bgHex));
        return b;
    }

    private String shortId(String s) {
        return s != null && s.length() > 6 ? s.substring(s.length() - 6) : (s != null ? s : "");
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        timerHandler.removeCallbacks(countdownTask);
        super.onDestroy();
    }
}
