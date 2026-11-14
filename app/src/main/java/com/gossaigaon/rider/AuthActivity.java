package com.gossaigaon.rider;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.database.FirebaseDatabase;

import java.util.HashMap;
import java.util.Map;

public class AuthActivity extends AppCompatActivity {

    private FirebaseAuth mAuth;
    private TextView tabLogin, tabSignup, tvError;
    private LinearLayout layoutLogin, layoutSignup;
    private EditText etLoginEmail, etLoginPass;
    private EditText etRegName, etRegEmail, etRegPhone, etRegUpi, etRegVehicle, etRegPass;
    private ProgressBar progressAuth;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mAuth = FirebaseAuth.getInstance();

        if (mAuth.getCurrentUser() != null) {
            goToMain();
            return;
        }

        setContentView(R.layout.activity_auth);

        tabLogin = findViewById(R.id.tabLogin);
        tabSignup = findViewById(R.id.tabSignup);
        tvError = findViewById(R.id.tvAuthError);
        layoutLogin = findViewById(R.id.layoutLogin);
        layoutSignup = findViewById(R.id.layoutSignup);
        progressAuth = findViewById(R.id.progressAuth);

        etLoginEmail = findViewById(R.id.etLoginEmail);
        etLoginPass = findViewById(R.id.etLoginPassword);
        etRegName = findViewById(R.id.etRegName);
        etRegEmail = findViewById(R.id.etRegEmail);
        etRegPhone = findViewById(R.id.etRegPhone);
        etRegUpi = findViewById(R.id.etRegUpi);
        etRegVehicle = findViewById(R.id.etRegVehicle);
        etRegPass = findViewById(R.id.etRegPassword);

        Button btnLogin = findViewById(R.id.btnLogin);
        Button btnSignup = findViewById(R.id.btnSignup);

        findViewById(R.id.layoutAuthTabs).setBackground(roundedBox("#0F172A", "#24344D", 14));
        EditText[] inputs = {etLoginEmail, etLoginPass, etRegName, etRegEmail, etRegPhone, etRegUpi, etRegVehicle, etRegPass};
        for (EditText et : inputs) et.setBackground(roundedBox("#0F172A", "#24344D", 12));
        btnLogin.setBackground(roundedBox("#16A34A", "#16A34A", 14));
        btnSignup.setBackground(roundedBox("#16A34A", "#16A34A", 14));
        switchTab(true);

        tabLogin.setOnClickListener(v -> switchTab(true));
        tabSignup.setOnClickListener(v -> switchTab(false));

        btnLogin.setOnClickListener(v -> attemptLogin());
        btnSignup.setOnClickListener(v -> attemptSignup());
    }

    private GradientDrawable roundedBox(String bgHex, String borderHex, int radiusDp) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(Color.parseColor(bgHex));
        gd.setCornerRadius(radiusDp * getResources().getDisplayMetrics().density);
        gd.setStroke(Math.round(1.2f * getResources().getDisplayMetrics().density), Color.parseColor(borderHex));
        return gd;
    }

    private void switchTab(boolean isLogin) {
        tvError.setText("");
        layoutLogin.setVisibility(isLogin ? View.VISIBLE : View.GONE);
        layoutSignup.setVisibility(isLogin ? View.GONE : View.VISIBLE);
        tabLogin.setBackground(isLogin ? roundedBox("#16A34A", "#16A34A", 10) : null);
        tabLogin.setTextColor(isLogin ? Color.WHITE : Color.parseColor("#94A3B8"));
        tabSignup.setBackground(!isLogin ? roundedBox("#16A34A", "#16A34A", 10) : null);
        tabSignup.setTextColor(!isLogin ? Color.WHITE : Color.parseColor("#94A3B8"));
    }

    private void attemptLogin() {
        String email = etLoginEmail.getText().toString().trim();
        String pass = etLoginPass.getText().toString();
        if (email.isEmpty() || pass.isEmpty()) {
            tvError.setText("Email aur Password enter karein!");
            return;
        }
        setLoading(true);
        mAuth.signInWithEmailAndPassword(email, pass)
                .addOnSuccessListener(res -> goToMain())
                .addOnFailureListener(e -> {
                    setLoading(false);
                    tvError.setText(e.getMessage());
                });
    }

    private void attemptSignup() {
        String name = etRegName.getText().toString().trim();
        String email = etRegEmail.getText().toString().trim();
        String phone = etRegPhone.getText().toString().trim();
        String upi = etRegUpi.getText().toString().trim();
        String vehicle = etRegVehicle.getText().toString().trim();
        String pass = etRegPass.getText().toString();

        if (name.isEmpty() || email.isEmpty() || vehicle.isEmpty() || pass.length() < 6) {
            tvError.setText("Sabhi fields sahi bharein (Password min 6 chars)!");
            return;
        }
        if (!TripHelper.isValidIndianMobile(phone)) {
            tvError.setText("Valid 10-digit mobile number enter karein!");
            return;
        }
        if (!TripHelper.isValidUpiId(upi)) {
            tvError.setText("Valid UPI ID enter karein (e.g. 9876543210@paytm)!");
            return;
        }

        setLoading(true);
        mAuth.createUserWithEmailAndPassword(email, pass)
                .addOnSuccessListener(res -> {
                    FirebaseUser user = res.getUser();
                    if (user == null) {
                        setLoading(false);
                        return;
                    }
                    Map<String, Object> profile = new HashMap<>();
                    profile.put("name", name);
                    profile.put("email", email);
                    profile.put("phone", phone);
                    profile.put("upiId", upi);
                    profile.put("vehicle", vehicle);
                    profile.put("approved", false);
                    profile.put("online", true);
                    profile.put("lat", 26.4524);
                    profile.put("lng", 89.9723);
                    profile.put("lastSeen", System.currentTimeMillis());

                    FirebaseDatabase.getInstance().getReference("deliveryPartners")
                            .child(user.getUid())
                            .setValue(profile)
                            .addOnSuccessListener(a -> goToMain())
                            .addOnFailureListener(e -> {
                                setLoading(false);
                                tvError.setText(e.getMessage());
                            });
                })
                .addOnFailureListener(e -> {
                    setLoading(false);
                    tvError.setText(e.getMessage());
                });
    }

    private void setLoading(boolean loading) {
        tvError.setText("");
        progressAuth.setVisibility(loading ? View.VISIBLE : View.GONE);
    }

    private void goToMain() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }
}
