package com.gossaigaon.rider;

import android.Manifest;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public class MainActivity extends AppCompatActivity implements RiderUiKit.TripActionListener {

    private static final int REQ_PERMS = 201;
    public static volatile boolean isAppInForeground = false;

    private FirebaseAuth mAuth;
    private DatabaseReference db;
    private FirebaseUser currentUser;
    private SharedPreferences secPrefs;

    private TextView tvSuspendedBanner, tvPersonalNotice, tvBroadcastBanner, tvApprovalBanner, tvCashLimitText;
    private TextView tvRiderName, tvRiderVehicle, tvRiderRating, tvDutyLabel, tvGpsSyncTime, tvActiveCount;
    private View dotOnline, layoutGpsBar, layoutCashLimitBanner, btnDutyToggle;
    private Button btnSoundToggle, btnBannerDeposit;

    private ScrollView scrollActive, scrollEarnings, scrollProfile;
    private TextView tvNavActive, tvNavEarnings, tvNavProfile;

    private LinearLayout containerActiveTrips, containerRatings, containerPayoutHistory, containerSettlementHistory, containerCompletedTrips, containerMyFeedbacks;
    private TextView tvAvailableEarnings, tvHeroUpi, tvPayoutLimits, tvTotalCommission, tvPaidByAdmin;
    private TextView tvCodCashLabel, tvCodCashInHand, tvCodDepositLimits, tvTotalCodCollected, tvSettledToAdmin, tvRatingsSummary;
    private TextView tvHelplineHours;
    private Button btnCallHub, btnWaHub, btnSendFeedback, btnSaveProfile, btnLogout, btnWithdrawEarnings, btnDepositCod;
    private EditText etProfName, etProfEmail, etProfPhone, etProfUpi, etProfVehicle;

    private int activeTabIndex = 0;
    private boolean soundEnabled = true, gpsServiceActive = false, isRinging = false;
    private boolean riderApproved = false, riderOnline = false, riderSuspended = false, mockGpsDetected = false;
    private boolean hasPendingPayout = false;
    private String riderName = "Gossaigaon Rider", riderPhone = "", riderUpi = "", riderVehicle = "Bike";
    private double riderLat = 26.4524, riderLng = 89.9723;

    private String adminUpiId = "gossaigaonbazar@apl", supportPhone = "", supportWhatsapp = "";
    private double baseRiderFee = 25, maxCashLimit = 3000;
    private double minRiderPayout = 10, maxRiderPayout = 10000;
    private double minRiderCodDeposit = 10, maxRiderCodDeposit = 25000;
    private long acceptTimeoutSec = 45;
    private boolean allowRiderPass = true, allowRiderSos = true;

    private double netCashInHand = 0, availablePayoutBalance = 0;
    private double approvedSettlementsTotal = 0, pendingSettlementsTotal = 0, paidPayoutsTotal = 0;

    private MediaPlayer alertPlayer;

    private final Map<String, TripHelper.StoreData> storesMap = new HashMap<>();
    private final List<TripHelper.OrderData> myActiveOrders = new ArrayList<>();
    private final List<TripHelper.OrderData> myCompletedOrders = new ArrayList<>();
    private final List<String> allExistingUtrs = new ArrayList<>();
    private final Map<String, TextView> timerViews = new HashMap<>();
    private final Map<String, ProgressBar> timerBars = new HashMap<>();
    private final Set<String> timedOutTrips = new HashSet<>();

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
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

        mAuth = FirebaseAuth.getInstance();
        currentUser = mAuth.getCurrentUser();
        if (currentUser == null) {
            startActivity(new Intent(this, AuthActivity.class));
            finish();
            return;
        }

        if (TripHelper.isDeviceRootedOrDebugged()) {
            new AlertDialog.Builder(this)
                    .setTitle("🚨 Security Alert")
                    .setMessage("Rooted device ya Debugger detect hua hai. App nahi chal sakti.")
                    .setCancelable(false)
                    .setPositiveButton("Exit", (d, w) -> finishAffinity())
                    .show();
            return;
        }

        secPrefs = getSharedPreferences("rider_sec_prefs", MODE_PRIVATE);
        db = FirebaseDatabase.getInstance().getReference();
        setContentView(R.layout.activity_main);

        bindViews();
        EditText[] darkInputs = {etProfName, etProfEmail, etProfPhone, etProfVehicle};
        RiderDialogs.applyNativeTheme(this, darkInputs, etProfUpi);
        setupNavAndClicks();
        requestLocationPermissions();
        attachFirebaseListeners();
        timerHandler.post(countdownTask);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (activeTabIndex != 0) switchTab(0);
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        isAppInForeground = true;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(LocationForegroundService.NOTIF_ORDER_ID);
        evaluateOrderRingtone();
    }

    @Override
    protected void onPause() {
        super.onPause();
        isAppInForeground = false;
    }

    private void bindViews() {
        tvSuspendedBanner = findViewById(R.id.tvSuspendedBanner);
        tvPersonalNotice = findViewById(R.id.tvPersonalNotice);
        tvBroadcastBanner = findViewById(R.id.tvBroadcastBanner);
        tvApprovalBanner = findViewById(R.id.tvApprovalBanner);
        layoutCashLimitBanner = findViewById(R.id.layoutCashLimitBanner);
        tvCashLimitText = findViewById(R.id.tvCashLimitText);
        btnBannerDeposit = findViewById(R.id.btnBannerDeposit);

        tvRiderName = findViewById(R.id.tvRiderName);
        tvRiderVehicle = findViewById(R.id.tvRiderVehicle);
        tvRiderRating = findViewById(R.id.tvRiderRating);
        btnSoundToggle = findViewById(R.id.btnSoundToggle);
        btnDutyToggle = findViewById(R.id.btnDutyToggle);
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
        btnWithdrawEarnings = findViewById(R.id.btnWithdrawEarnings);

        tvCodCashLabel = findViewById(R.id.tvCodCashLabel);
        tvCodCashInHand = findViewById(R.id.tvCodCashInHand);
        tvCodDepositLimits = findViewById(R.id.tvCodDepositLimits);
        tvTotalCodCollected = findViewById(R.id.tvTotalCodCollected);
        tvSettledToAdmin = findViewById(R.id.tvSettledToAdmin);
        btnDepositCod = findViewById(R.id.btnDepositCod);
        tvRatingsSummary = findViewById(R.id.tvRatingsSummary);

        tvHelplineHours = findViewById(R.id.tvHelplineHours);
        btnCallHub = findViewById(R.id.btnCallHub);
        btnWaHub = findViewById(R.id.btnWaHub);
        btnSendFeedback = findViewById(R.id.btnSendFeedback);

        etProfName = findViewById(R.id.etProfName);
        etProfEmail = findViewById(R.id.etProfEmail);
        etProfPhone = findViewById(R.id.etProfPhone);
        etProfUpi = findViewById(R.id.etProfUpi);
        etProfVehicle = findViewById(R.id.etProfVehicle);
        btnSaveProfile = findViewById(R.id.btnSaveProfile);
        btnLogout = findViewById(R.id.btnLogout);
    }

    private void setupNavAndClicks() {
        findViewById(R.id.navActive).setOnClickListener(v -> switchTab(0));
        findViewById(R.id.navEarnings).setOnClickListener(v -> switchTab(1));
        findViewById(R.id.navProfile).setOnClickListener(v -> switchTab(2));

        btnSoundToggle.setOnClickListener(v -> {
            soundEnabled = !soundEnabled;
            btnSoundToggle.setText(soundEnabled ? "🔊" : "🔇");
            evaluateOrderRingtone();
            toast(soundEnabled ? "Trip chime: ON" : "Trip chime: MUTED");
        });

        btnDutyToggle.setOnClickListener(v -> toggleDuty());
        btnBannerDeposit.setOnClickListener(v -> { switchTab(1); showDepositDialog(); });
        btnWithdrawEarnings.setOnClickListener(v -> showWithdrawDialog());
        btnDepositCod.setOnClickListener(v -> showDepositDialog());
        btnSendFeedback.setOnClickListener(v -> showFeedbackDialog());
        btnSaveProfile.setOnClickListener(v -> saveProfile());
        btnLogout.setOnClickListener(v -> logoutRider());

        btnCallHub.setOnClickListener(v -> { if (!supportPhone.isEmpty()) onDialPhone(supportPhone); });
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
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) list.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) list.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            list.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!list.isEmpty()) ActivityCompat.requestPermissions(this, list.toArray(new String[0]), REQ_PERMS);
        else promptBackgroundPermission();
    }

    private void promptBackgroundPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            new AlertDialog.Builder(this)
                    .setTitle("Background GPS Permission")
                    .setMessage("Screen off hone par bhi 5 second live location update ke liye Location permission ko 'Allow all the time' par set karein.")
                    .setPositiveButton("Settings", (d, w) -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null))))
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
                mockGpsDetected = TripHelper.getBool(s, "mockGpsDetected", false);
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

                if (mockGpsDetected) {
                    tvSuspendedBanner.setText("🚨 FAKE GPS DETECTED: Mock Location app band karein!");
                    tvSuspendedBanner.setVisibility(View.VISIBLE);
                } else if (riderSuspended) {
                    tvSuspendedBanner.setText("🚫 ACCOUNT SUSPENDED BY ADMIN: Duty aur trips locked hain.");
                    tvSuspendedBanner.setVisibility(View.VISIBLE);
                } else {
                    tvSuspendedBanner.setVisibility(View.GONE);
                }

                tvApprovalBanner.setVisibility(riderApproved ? View.GONE : View.VISIBLE);
                if (!adminNote.isEmpty()) {
                    tvPersonalNotice.setText("💬 MESSAGE FROM ADMIN: " + adminNote);
                    tvPersonalNotice.setVisibility(View.VISIBLE);
                } else tvPersonalNotice.setVisibility(View.GONE);

                if (riderOnline && !riderSuspended && !mockGpsDetected) {
                    dotOnline.setBackground(RiderUiKit.makeOval("#16A34A"));
                    tvDutyLabel.setText("Online");
                    layoutGpsBar.setVisibility(View.VISIBLE);
                    if (lastLoc > 0) tvGpsSyncTime.setText("Synced " + new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date(lastLoc)));
                    startGpsService();
                } else {
                    dotOnline.setBackground(RiderUiKit.makeOval("#EF4444"));
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
            @Override public void onCancelled(@NonNull DatabaseError error) {}
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
            @Override public void onCancelled(@NonNull DatabaseError error) {}
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
                    tvBroadcastBanner.setText("📢 ADMIN NOTICE: " + ann);
                    tvBroadcastBanner.setVisibility(View.VISIBLE);
                } else tvBroadcastBanner.setVisibility(View.GONE);

                supportPhone = TripHelper.getStr(s, "supportPhone", "");
                supportWhatsapp = TripHelper.getStr(s, "supportWhatsapp", "");
                String hrs = TripHelper.getStr(s, "supportHours", "");
                tvHelplineHours.setText(hrs.isEmpty() ? "Need hub assistance?" : "Helpline Hours: " + hrs);
                btnCallHub.setVisibility(supportPhone.isEmpty() ? View.GONE : View.VISIBLE);
                btnWaHub.setVisibility((supportWhatsapp.isEmpty() && supportPhone.isEmpty()) ? View.GONE : View.VISIBLE);

                tvPayoutLimits.setText(String.format(Locale.US, "Limits: ₹%.0f - ₹%.0f", minRiderPayout, maxRiderPayout));
                tvCodCashLabel.setText(String.format(Locale.US, "ADMIN COD CASH IN HAND (MAX ₹%.0f)", maxCashLimit));
                tvCodDepositLimits.setText(String.format(Locale.US, "Deposit Limits: ₹%.0f - ₹%.0f", minRiderCodDeposit, maxRiderCodDeposit));
                tvCashLimitText.setText(String.format(Locale.US, "🔒 CASH LIMIT EXCEEDED (₹%.0f+): Deposit COD cash to unlock pickups!", maxCashLimit));

                recalculateFinancials();
                renderTripsUI();
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("orders").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                myActiveOrders.clear();
                myCompletedOrders.clear();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    if (!uid.equals(TripHelper.getStr(ds, "deliveryUid", ""))) continue;
                    TripHelper.OrderData o = RiderDialogs.parseOrder(ds);
                    if ("DELIVERED".equals(o.status) || "CANCELLED".equals(o.status)) myCompletedOrders.add(o);
                    else myActiveOrders.add(o);
                }
                evaluateOrderRingtone();
                recalculateFinancials();
                renderTripsUI();
                renderCompletedTripsUI();
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("settlements").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                allExistingUtrs.clear();
                approvedSettlementsTotal = 0;
                pendingSettlementsTotal = 0;
                containerSettlementHistory.removeAllViews();
                List<DataSnapshot> mine = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    String utr = TripHelper.getStr(ds, "utr", "");
                    if (!utr.isEmpty()) allExistingUtrs.add(utr);
                    if (uid.equals(TripHelper.getStr(ds, "riderUid", ""))) {
                        mine.add(ds);
                        String st = TripHelper.getStr(ds, "status", "PENDING");
                        double amt = TripHelper.getDouble(ds, "amount", 0);
                        if ("APPROVED".equals(st)) approvedSettlementsTotal += amt;
                        else if ("PENDING".equals(st)) pendingSettlementsTotal += amt;
                    }
                }
                Collections.reverse(mine);
                if (mine.isEmpty()) containerSettlementHistory.addView(RiderUiKit.makeEmptyText(MainActivity.this, "No COD handover requests yet."));
                else {
                    for (DataSnapshot ds : mine) {
                        String st = TripHelper.getStr(ds, "status", "PENDING");
                        containerSettlementHistory.addView(RiderUiKit.makeLogRow(MainActivity.this,
                                String.format(Locale.US, "₹%.2f", TripHelper.getDouble(ds, "amount", 0)),
                                TripHelper.getStr(ds, "mode", "") + " • " + TripHelper.getStr(ds, "utr", ""),
                                st, "APPROVED".equals(st) ? "#34D399" : "#FBBF24"));
                    }
                }
                recalculateFinancials();
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("riderPayouts").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                paidPayoutsTotal = 0;
                hasPendingPayout = false;
                containerPayoutHistory.removeAllViews();
                List<DataSnapshot> mine = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) {
                    if (uid.equals(TripHelper.getStr(ds, "riderUid", ""))) {
                        mine.add(ds);
                        String st = TripHelper.getStr(ds, "status", "PENDING");
                        if ("PAID".equals(st)) paidPayoutsTotal += TripHelper.getDouble(ds, "amount", 0);
                        else if ("PENDING".equals(st)) hasPendingPayout = true;
                    }
                }
                Collections.reverse(mine);
                if (mine.isEmpty()) containerPayoutHistory.addView(RiderUiKit.makeEmptyText(MainActivity.this, "No payout requests yet."));
                else {
                    for (DataSnapshot ds : mine) {
                        String st = TripHelper.getStr(ds, "status", "PENDING");
                        String ref = TripHelper.getStr(ds, "adminRef", "");
                        containerPayoutHistory.addView(RiderUiKit.makeLogRow(MainActivity.this,
                                String.format(Locale.US, "₹%.2f", TripHelper.getDouble(ds, "amount", 0)),
                                "UPI: " + TripHelper.getStr(ds, "riderUpiId", "") + (ref.isEmpty() ? "" : " • Ref: " + ref),
                                st, "PAID".equals(st) ? "#34D399" : "#FBBF24"));
                    }
                }
                recalculateFinancials();
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("riderRatings").child(uid).addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                containerRatings.removeAllViews();
                List<DataSnapshot> list = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) list.add(ds);
                Collections.reverse(list);
                if (list.isEmpty()) { containerRatings.addView(RiderUiKit.makeEmptyText(MainActivity.this, "No customer ratings yet.")); return; }
                for (int i = 0; i < Math.min(10, list.size()); i++) {
                    DataSnapshot ds = list.get(i);
                    containerRatings.addView(RiderUiKit.makeLogRow(MainActivity.this,
                            TripHelper.getStr(ds, "customerName", "Customer"),
                            TripHelper.getStr(ds, "comment", "Rated delivery"),
                            "⭐ " + TripHelper.getLong(ds, "rating", 5), "#FBBF24"));
                }
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });

        db.child("feedbacks").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                containerMyFeedbacks.removeAllViews();
                List<DataSnapshot> mine = new ArrayList<>();
                for (DataSnapshot ds : snapshot.getChildren()) if (uid.equals(TripHelper.getStr(ds, "uid", ""))) mine.add(ds);
                Collections.reverse(mine);
                for (int i = 0; i < Math.min(3, mine.size()); i++) {
                    DataSnapshot ds = mine.get(i);
                    String st = TripHelper.getStr(ds, "status", "OPEN");
                    String reply = TripHelper.getStr(ds, "adminReply", "");
                    containerMyFeedbacks.addView(RiderUiKit.makeLogRow(MainActivity.this,
                            TripHelper.getStr(ds, "subject", "Ticket"),
                            reply.isEmpty() ? TripHelper.getStr(ds, "message", "") : "Admin: " + reply,
                            st, "RESOLVED".equals(st) ? "#34D399" : "#FBBF24"));
                }
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });
    }

    private void evaluateOrderRingtone() {
        boolean hasUnaccepted = false;
        for (TripHelper.OrderData o : myActiveOrders) {
            if (!Boolean.TRUE.equals(o.riderAccepted)) { hasUnaccepted = true; break; }
        }
        if (hasUnaccepted && soundEnabled) startLoopingRingtone();
        else stopLoopingRingtone();
    }

    private void startLoopingRingtone() {
        if (isRinging) return;
        try {
            Uri ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringUri == null) ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (ringUri == null) ringUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            alertPlayer = new MediaPlayer();
            alertPlayer.setDataSource(getApplicationContext(), ringUri);
            alertPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            alertPlayer.setLooping(true);
            alertPlayer.prepare();
            alertPlayer.start();
            isRinging = true;
        } catch (Exception e) {
            stopLoopingRingtone();
        }
    }

    private void stopLoopingRingtone() {
        isRinging = false;
        if (alertPlayer != null) {
            try { if (alertPlayer.isPlaying()) alertPlayer.stop(); alertPlayer.release(); } catch (Exception ignored) {}
            alertPlayer = null;
        }
    }

    private void renderTripsUI() {
        containerActiveTrips.removeAllViews();
        timerViews.clear();
        timerBars.clear();
        List<TripHelper.TripGroup> trips = RiderDialogs.groupOrders(myActiveOrders);
        tvActiveCount.setText(trips.size() + " Active");

        if (trips.isEmpty()) {
            containerActiveTrips.addView(RiderUiKit.makeEmptyText(this, "🛒 No active grocery trips.\nTurn Online to receive auto-dispatches!"));
            return;
        }
        for (TripHelper.TripGroup trip : trips) {
            containerActiveTrips.addView(RiderUiKit.buildTripCard(
                    this, trip, baseRiderFee, riderLat, riderLng, acceptTimeoutSec,
                    allowRiderPass, allowRiderSos, storesMap, timerViews, timerBars, this
            ));
        }
        updateAcceptTimers();
    }

    private void updateAcceptTimers() {
        long now = System.currentTimeMillis();
        for (TripHelper.TripGroup trip : RiderDialogs.groupOrders(myActiveOrders)) {
            boolean accepted = true;
            for (TripHelper.OrderData o : trip.orders) if (!Boolean.TRUE.equals(o.riderAccepted)) accepted = false;
            if (accepted || TripHelper.isTripPickedUp(trip)) continue;

            long rem = Math.max(0, acceptTimeoutSec - ((now - trip.assignedAt) / 1000L));
            TextView tv = timerViews.get(trip.tripId);
            if (tv != null) tv.setText("⏳ Auto-Pass in: " + rem + "s");
            ProgressBar pb = timerBars.get(trip.tripId);
            if (pb != null) { pb.setMax((int) acceptTimeoutSec); pb.setProgress((int) rem); }
            if (rem <= 0 && !timedOutTrips.contains(trip.tripId)) {
                timedOutTrips.add(trip.tripId);
                onPassTrip(trip, "Auto-Timeout (" + acceptTimeoutSec + "s)");
            }
        }
    }

    @Override
    public void onAcceptTrip(TripHelper.TripGroup trip) {
        if (riderSuspended) { toast("Account suspended!"); return; }
        if (mockGpsDetected) { toast("🚨 Disable Fake GPS app first!"); return; }
        stopLoopingRingtone();
        long now = System.currentTimeMillis();
        for (TripHelper.OrderData o : trip.orders) {
            Map<String, Object> up = new HashMap<>();
            up.put("riderAccepted", true); up.put("riderAcceptedAt", now);
            up.put("riderLat", riderLat); up.put("riderLng", riderLng);
            up.put("lastLocationUpdate", now); up.put("updatedAt", now);
            db.child("orders").child(o.orderId).updateChildren(up);
        }
        toast("🎉 Trip Accepted!");
    }

    @Override
    public void onConfirmStorePickup(String orderId) {
        if (mockGpsDetected) { toast("🚨 Disable Fake GPS app first!"); return; }
        long now = System.currentTimeMillis();
        Map<String, Object> up = new HashMap<>();
        up.put("status", "PICKED_UP"); up.put("storePickupVerifiedAt", now);
        up.put("pickupLat", riderLat); up.put("pickupLng", riderLng);
        up.put("riderLat", riderLat); up.put("riderLng", riderLng);
        up.put("lastLocationUpdate", now); up.put("updatedAt", now);
        db.child("orders").child(orderId).updateChildren(up);
        toast("✅ Order Picked Up! Cancel/Pass ab lock ho gaya hai.");
    }

    @Override
    public void onStartDoorstepRoute(TripHelper.TripGroup trip) {
        long now = System.currentTimeMillis();
        for (TripHelper.OrderData o : trip.orders) {
            Map<String, Object> up = new HashMap<>();
            up.put("status", "OUT_FOR_DELIVERY");
            up.put("riderLat", riderLat); up.put("riderLng", riderLng);
            up.put("lastLocationUpdate", now); up.put("updatedAt", now);
            db.child("orders").child(o.orderId).updateChildren(up);
        }
        toast("🛵 Doorstep route started!");
    }

    @Override
    public void onPassTrip(final TripHelper.TripGroup trip, final String reason) {
        if (TripHelper.isTripPickedUp(trip)) { toast("🔒 Store se pickup ke baad cancel/pass nahi ho sakta!"); return; }
        stopLoopingRingtone();
        toast("Nearest rider to store dhoondh rahe hain...");
        db.child("deliveryPartners").addListenerForSingleValueEvent(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                TripHelper.StoreData st = storesMap.get(trip.orders.get(0).restaurantId);
                double sLat = st != null ? st.lat : riderLat, sLng = st != null ? st.lng : riderLng;
                String nextUid = null, fallbackUid = null, myUid = currentUser.getUid();
                double minDist = Double.MAX_VALUE;

                for (DataSnapshot ds : snapshot.getChildren()) {
                    String uid = ds.getKey();
                    if (uid == null || uid.equals(myUid)) continue;
                    if (!TripHelper.getBool(ds, "approved", false) || !TripHelper.getBool(ds, "online", false)
                            || TripHelper.getBool(ds, "suspended", false) || TripHelper.getBool(ds, "mockGpsDetected", false)) continue;

                    boolean rejected = false;
                    for (TripHelper.OrderData o : trip.orders) if (o.rejectedRiderUids.contains(uid)) { rejected = true; break; }
                    if (rejected) continue;

                    double rLat = TripHelper.getDouble(ds, "lat", 0), rLng = TripHelper.getDouble(ds, "lng", 0);
                    if (rLat != 0 && rLng != 0) {
                        double d = TripHelper.calculateDistanceKm(sLat, sLng, rLat, rLng);
                        if (d >= 0 && d < minDist) { minDist = d; nextUid = uid; }
                    } else if (fallbackUid == null) fallbackUid = uid;
                }
                if (nextUid == null) nextUid = fallbackUid;

                long now = System.currentTimeMillis();
                String cleanReason = TripHelper.sanitizeText(reason);
                for (TripHelper.OrderData o : trip.orders) {
                    Map<String, Object> up = new HashMap<>();
                    up.put("deliveryUid", nextUid); up.put("riderAccepted", null); up.put("riderAcceptedAt", null);
                    up.put("assignedAt", nextUid != null ? now : null); up.put("updatedAt", now);
                    Map<String, Object> rej = new HashMap<>();
                    rej.put("riderName", riderName); rej.put("riderPhone", riderPhone);
                    rej.put("reason", cleanReason); rej.put("timestamp", now);
                    up.put("rejectedByRiders/" + myUid, rej);
                    db.child("orders").child(o.orderId).updateChildren(up);
                }
                toast(nextUid != null ? "⚡ Trip nearest rider ko pass ho gaya!" : "Admin queue me bhej diya gaya.");
            }
            @Override public void onCancelled(@NonNull DatabaseError error) {}
        });
    }

    @Override
    public void onShowPassDialog(final TripHelper.TripGroup trip) {
        if (!allowRiderPass) { toast("Passing trips disabled by Admin."); return; }
        if (TripHelper.isTripPickedUp(trip)) { toast("🔒 Pickup ke baad cancel/pass nahi ho sakta!"); return; }
        RiderDialogs.showPassDialog(this, trip, (t, r) -> onPassTrip(t, r));
    }

    @Override
    public void onShowSosDialog(final TripHelper.TripGroup trip) {
        RiderDialogs.showSosDialog(this, db, trip);
    }

    @Override
    public void onShowPinDialog(final TripHelper.TripGroup trip, final double totalBill, final boolean isPrepaid) {
        if (mockGpsDetected) { toast("🚨 Disable Fake GPS app first!"); return; }
        RiderDialogs.showPinDialog(this, secPrefs, db, trip, totalBill, isPrepaid, riderLat, riderLng);
    }

    private void recalculateFinancials() {
        double codCollected = 0, totalEarned = 0;
        for (TripHelper.OrderData o : myCompletedOrders) {
            if ("DELIVERED".equals(o.status)) {
                totalEarned += (o.deliveryCharge > 0 ? o.deliveryCharge : baseRiderFee);
                if (!"UPI".equals(o.paymentMode) && !"WALLET".equals(o.paymentMode)) codCollected += o.totalAmount;
            }
        }
        netCashInHand = Math.max(0, codCollected - approvedSettlementsTotal);
        availablePayoutBalance = Math.max(0, totalEarned - paidPayoutsTotal);

        tvAvailableEarnings.setText(String.format(Locale.US, "₹%.2f", availablePayoutBalance));
        tvTotalCommission.setText(String.format(Locale.US, "Total Commission: ₹%.2f", totalEarned));
        tvPaidByAdmin.setText(String.format(Locale.US, "Paid by Admin: ₹%.2f", paidPayoutsTotal));
        tvCodCashInHand.setText(String.format(Locale.US, "₹%.2f", netCashInHand));
        tvTotalCodCollected.setText(String.format(Locale.US, "Total COD: ₹%.2f", codCollected));
        tvSettledToAdmin.setText(String.format(Locale.US, "Settled: ₹%.2f", approvedSettlementsTotal));
        layoutCashLimitBanner.setVisibility(netCashInHand >= maxCashLimit ? View.VISIBLE : View.GONE);
    }

    private void renderCompletedTripsUI() {
        containerCompletedTrips.removeAllViews();
        List<TripHelper.TripGroup> done = RiderDialogs.groupOrders(myCompletedOrders);
        if (done.isEmpty()) { containerCompletedTrips.addView(RiderUiKit.makeEmptyText(this, "No past completed trips yet.")); return; }
        Collections.reverse(done);
        for (TripHelper.TripGroup t : done) {
            double fee = 0;
            for (TripHelper.OrderData o : t.orders) fee += (o.deliveryCharge > 0 ? o.deliveryCharge : baseRiderFee);
            containerCompletedTrips.addView(RiderUiKit.makeLogRow(this, "#" + RiderUiKit.shortId(t.tripId) + " • Completed", t.address, String.format(Locale.US, "+₹%.0f EARNED", fee), "#34D399"));
        }
    }

    private void showWithdrawDialog() {
        if (hasPendingPayout) { toast("⏳ Ek payout request pehle se PENDING hai!"); return; }
        if (availablePayoutBalance < minRiderPayout) { toast(String.format(Locale.US, "Minimum ₹%.0f balance required!", minRiderPayout)); return; }
        RiderDialogs.showWithdrawDialog(this, db, currentUser.getUid(), riderName, riderPhone, riderUpi, availablePayoutBalance, minRiderPayout, maxRiderPayout);
    }

    private void showDepositDialog() {
        double maxAllowable = Math.max(0, netCashInHand - pendingSettlementsTotal);
        if (maxAllowable <= 0) {
            toast(pendingSettlementsTotal > 0 ? "⏳ Aapka COD handover pehle se PENDING hai!" : "No COD cash balance to deposit!");
            return;
        }
        RiderDialogs.showDepositDialog(this, db, currentUser.getUid(), riderName, adminUpiId, netCashInHand, pendingSettlementsTotal, minRiderCodDeposit, maxRiderCodDeposit, allExistingUtrs);
    }

    private void showFeedbackDialog() {
        RiderDialogs.showFeedbackDialog(this, db, currentUser.getUid(), riderName, riderPhone);
    }

    private void toggleDuty() {
        if (riderSuspended) { toast("🚫 Account suspended by Admin!"); return; }
        if (mockGpsDetected) { toast("🚨 Disable Fake GPS app first!"); return; }
        boolean next = !riderOnline;
        if (next && netCashInHand >= maxCashLimit) { toast("🛑 Cash Limit Exceeded! Deposit cash first."); return; }
        Map<String, Object> up = new HashMap<>();
        up.put("online", next); up.put("lastSeen", System.currentTimeMillis());
        db.child("deliveryPartners").child(currentUser.getUid()).updateChildren(up);
        toast(next ? "Duty ON: Live 5s GPS active!" : "Duty OFF: Shift Ended.");
    }

    private void saveProfile() {
        String n = TripHelper.sanitizeText(etProfName.getText().toString());
        String p = etProfPhone.getText().toString().trim();
        String u = TripHelper.sanitizeText(etProfUpi.getText().toString());
        String v = TripHelper.sanitizeText(etProfVehicle.getText().toString());
        if (n.isEmpty() || v.isEmpty()) { toast("Name aur Vehicle enter karein!"); return; }
        if (!TripHelper.isValidIndianMobile(p)) { toast("Valid 10-digit mobile enter karein!"); return; }
        if (!TripHelper.isValidUpiId(u)) { toast("Valid UPI ID enter karein!"); return; }
        Map<String, Object> up = new HashMap<>();
        up.put("name", n); up.put("phone", p); up.put("upiId", u); up.put("vehicle", v); up.put("updatedAt", System.currentTimeMillis());
        db.child("deliveryPartners").child(currentUser.getUid()).updateChildren(up);
        toast("Rider profile & UPI ID saved!");
    }

    private void logoutRider() {
        stopLoopingRingtone();
        gpsServiceActive = false;
        Intent i = new Intent(this, LocationForegroundService.class);
        i.setAction(LocationForegroundService.ACTION_STOP);
        startService(i);
        db.child("deliveryPartners").child(currentUser.getUid()).child("online").setValue(false);
        mAuth.signOut();
        startActivity(new Intent(this, AuthActivity.class));
        finish();
    }

    @Override
    public void onOpenMaps(double lat, double lng, String fallbackQuery) {
        String uri = (lat != 0 && lng != 0) ? "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng
                : "https://www.google.com/maps/dir/?api=1&destination=" + Uri.encode(fallbackQuery);
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(uri))); } catch (Exception e) { toast("Google Maps not found"); }
    }

    @Override
    public void onDialPhone(String phone) {
        try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone))); } catch (Exception ignored) {}
    }

    @Override
    public void onOpenWhatsApp(String rawPhone) {
        String digits = rawPhone.replaceAll("\\D", "");
        if (digits.length() == 10) digits = "91" + digits;
        String url = "https://wa.me/" + digits + "?text=" + Uri.encode("Namaste! Gossaigaon Bazar rider arriving with your order.");
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { toast("WhatsApp not found"); }
    }

    private void setIfUnfocused(EditText et, String val) {
        if (!et.hasFocus()) et.setText(val);
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        stopLoopingRingtone();
        timerHandler.removeCallbacks(countdownTask);
        super.onDestroy();
    }
}
