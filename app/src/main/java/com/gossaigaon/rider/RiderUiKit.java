package com.gossaigaon.rider;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class RiderUiKit {

    public interface TripActionListener {
        void onAcceptTrip(TripHelper.TripGroup trip);
        void onPassTrip(TripHelper.TripGroup trip, String reason);
        void onShowPassDialog(TripHelper.TripGroup trip);
        void onConfirmStorePickup(String orderId);
        void onStartDoorstepRoute(TripHelper.TripGroup trip);
        void onShowPinDialog(TripHelper.TripGroup trip, double totalBill, boolean isPrepaid);
        void onShowSosDialog(TripHelper.TripGroup trip);
        void onOpenMaps(double lat, double lng, String fallback);
        void onDialPhone(String phone);
        void onOpenWhatsApp(String phone);
    }

    public static GradientDrawable makeBox(Context ctx, String bgHex, String strokeHex, float strokeDp, int radiusDp, boolean dashed) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(Color.parseColor(bgHex));
        gd.setCornerRadius(dpF(ctx, radiusDp));
        if (strokeDp > 0) {
            if (dashed) {
                gd.setStroke(dp(ctx, strokeDp), Color.parseColor(strokeHex), dpF(ctx, 6), dpF(ctx, 4));
            } else {
                gd.setStroke(dp(ctx, strokeDp), Color.parseColor(strokeHex));
            }
        }
        return gd;
    }

    public static GradientDrawable makeGradient(Context ctx, String topHex, String bottomHex, String strokeHex, float strokeDp, int radiusDp) {
        GradientDrawable gd = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.parseColor(topHex), Color.parseColor(bottomHex)});
        gd.setCornerRadius(dpF(ctx, radiusDp));
        gd.setStroke(dp(ctx, strokeDp), Color.parseColor(strokeHex));
        return gd;
    }

    public static GradientDrawable makeOval(String colorHex) {
        GradientDrawable gd = new GradientDrawable();
        gd.setShape(GradientDrawable.OVAL);
        gd.setColor(Color.parseColor(colorHex));
        return gd;
    }

    public static TextView makePill(Context ctx, String text, String bgHex, String textHex, String borderHex) {
        TextView tv = new TextView(ctx);
        tv.setText(text);
        tv.setTextColor(Color.parseColor(textHex));
        tv.setTextSize(10);
        tv.setTypeface(null, Typeface.BOLD);
        tv.setBackground(makeBox(ctx, bgHex, borderHex, 1f, 8, false));
        tv.setPadding(dp(ctx, 8), dp(ctx, 3), dp(ctx, 8), dp(ctx, 3));
        return tv;
    }

    public static Button makeBtn(Context ctx, String text, String bgHex, String textHex, String borderHex) {
        Button b = new Button(ctx);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(12);
        b.setTypeface(null, Typeface.BOLD);
        b.setTextColor(Color.parseColor(textHex));
        b.setBackground(makeBox(ctx, bgHex, borderHex, 1.2f, 12, false));
        return b;
    }

    public static View makeLogRow(Context ctx, String title, String sub, String badge, String badgeColor) {
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackground(makeBox(ctx, "#0F172A", "#24344D", 1f, 12, false));
        row.setPadding(dp(ctx, 12), dp(ctx, 10), dp(ctx, 12), dp(ctx, 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(ctx, 8);
        row.setLayoutParams(lp);

        LinearLayout left = new LinearLayout(ctx);
        left.setOrientation(LinearLayout.VERTICAL);
        TextView t1 = new TextView(ctx);
        t1.setText(title);
        t1.setTextColor(Color.WHITE);
        t1.setTextSize(14);
        t1.setTypeface(null, Typeface.BOLD);
        left.addView(t1);

        TextView t2 = new TextView(ctx);
        t2.setText(sub);
        t2.setTextColor(Color.parseColor("#94A3B8"));
        t2.setTextSize(11);
        left.addView(t2);
        row.addView(left, new LinearLayout.LayoutParams(0, -2, 1f));

        TextView right = new TextView(ctx);
        right.setText(badge);
        right.setTextColor(Color.parseColor(badgeColor));
        right.setTextSize(11);
        right.setTypeface(null, Typeface.BOLD);
        row.addView(right);
        return row;
    }

    public static TextView makeEmptyText(Context ctx, String msg) {
        TextView tv = new TextView(ctx);
        tv.setText(msg);
        tv.setTextColor(Color.parseColor("#94A3B8"));
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(dp(ctx, 12), dp(ctx, 22), dp(ctx, 12), dp(ctx, 22));
        return tv;
    }

    public static View buildTripCard(
            Context ctx,
            final TripHelper.TripGroup trip,
            double baseRiderFee,
            double riderLat,
            double riderLng,
            long acceptTimeoutSec,
            boolean allowRiderPass,
            boolean allowRiderSos,
            Map<String, TripHelper.StoreData> storesMap,
            Map<String, TextView> timerViews,
            Map<String, ProgressBar> timerBars,
            final TripActionListener listener
    ) {
        boolean isAccepted = true;
        boolean allUpiVerified = true;
        double totalBill = 0, totalFee = 0;
        StringBuilder itemsSummary = new StringBuilder();
        for (TripHelper.OrderData o : trip.orders) {
            if (!Boolean.TRUE.equals(o.riderAccepted)) isAccepted = false;
            if (!"VERIFIED".equals(o.paymentStatus)) allUpiVerified = false;
            totalBill += o.totalAmount;
            totalFee += (o.deliveryCharge > 0 ? o.deliveryCharge : baseRiderFee);
            for (TripHelper.OrderItem it : o.items) {
                if (itemsSummary.length() > 0) itemsSummary.append(", ");
                itemsSummary.append(it.qty).append("× ").append(it.name);
            }
        }
        final boolean hasPickedUp = TripHelper.isTripPickedUp(trip);
        final boolean isPrepaid = "WALLET".equals(trip.paymentMode) || ("UPI".equals(trip.paymentMode) && allUpiVerified);

        LinearLayout card = new LinearLayout(ctx);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(ctx, 16), dp(ctx, 16), dp(ctx, 16), dp(ctx, 16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(ctx, 16);
        card.setLayoutParams(lp);

        if (!isAccepted) {
            card.setBackground(makeBox(ctx, "#0F172A", "#F59E0B", 2f, 22, false));

            LinearLayout head = new LinearLayout(ctx);
            head.setOrientation(LinearLayout.HORIZONTAL);
            head.setGravity(Gravity.CENTER_VERTICAL);
            TextView t = new TextView(ctx);
            t.setText("⚡ " + (trip.orders.size() > 1 ? trip.orders.size() + "-STORES COMBO TRIP" : "NEW TRIP ASSIGNED") + "\n#" + shortId(trip.tripId));
            t.setTextColor(Color.parseColor("#FEF08A"));
            t.setTextSize(15);
            t.setTypeface(null, Typeface.BOLD);
            head.addView(t, new LinearLayout.LayoutParams(0, -2, 1f));
            head.addView(makePill(ctx, "ACCEPT REQUIRED", "#291E0B", "#FBBF24", "#F59E0B"));
            card.addView(head);

            TextView tvTimer = new TextView(ctx);
            tvTimer.setTextColor(Color.parseColor("#F59E0B"));
            tvTimer.setTextSize(12);
            tvTimer.setTypeface(null, Typeface.BOLD);
            tvTimer.setPadding(0, dp(ctx, 10), 0, dp(ctx, 4));
            card.addView(tvTimer);
            timerViews.put(trip.tripId, tvTimer);

            ProgressBar pb = new ProgressBar(ctx, null, android.R.attr.progressBarStyleHorizontal);
            pb.setMax((int) acceptTimeoutSec);
            pb.setProgress((int) acceptTimeoutSec);
            pb.setProgressTintList(ColorStateList.valueOf(Color.parseColor("#F59E0B")));
            pb.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#24344D")));
            LinearLayout.LayoutParams pbp = new LinearLayout.LayoutParams(-1, dp(ctx, 8));
            pbp.bottomMargin = dp(ctx, 12);
            card.addView(pb, pbp);
            timerBars.put(trip.tripId, pb);

            LinearLayout earnBox = new LinearLayout(ctx);
            earnBox.setOrientation(LinearLayout.HORIZONTAL);
            earnBox.setBackground(makeBox(ctx, "#0C291B", "#16A34A", 1.5f, 14, false));
            earnBox.setPadding(dp(ctx, 12), dp(ctx, 12), dp(ctx, 12), dp(ctx, 12));
            LinearLayout.LayoutParams ebp = new LinearLayout.LayoutParams(-1, -2);
            ebp.bottomMargin = dp(ctx, 10);
            earnBox.setLayoutParams(ebp);

            TextView eLeft = new TextView(ctx);
            eLeft.setText("YOUR EARNING\n+₹" + Math.round(totalFee));
            eLeft.setTextColor(Color.parseColor("#16A34A"));
            eLeft.setTextSize(16);
            eLeft.setTypeface(null, Typeface.BOLD);
            earnBox.addView(eLeft, new LinearLayout.LayoutParams(0, -2, 1f));

            TextView eRight = new TextView(ctx);
            eRight.setGravity(Gravity.END);
            String payLabel = isPrepaid ? trip.paymentMode + " Paid" : ("UPI".equals(trip.paymentMode) ? "UPI Hold" : "COD: ₹" + Math.round(totalBill));
            eRight.setText("PAYMENT\n" + payLabel);
            eRight.setTextColor(Color.WHITE);
            eRight.setTextSize(13);
            eRight.setTypeface(null, Typeface.BOLD);
            earnBox.addView(eRight);
            card.addView(earnBox);

            for (int i = 0; i < trip.orders.size(); i++) {
                TripHelper.OrderData o = trip.orders.get(i);
                TripHelper.StoreData st = storesMap.get(o.restaurantId);
                String stName = st != null ? st.name : "Store";
                double dist = st != null ? TripHelper.calculateDistanceKm(riderLat, riderLng, st.lat, st.lng) : -1;
                TextView stBadge = makePill(ctx, "Store " + (i + 1) + ": " + stName + (dist >= 0 ? String.format(Locale.US, " (~%.1f km)", dist) : ""),
                        "#1D4ED8", "#FFFFFF", "#1D4ED8");
                LinearLayout.LayoutParams sbp = new LinearLayout.LayoutParams(-2, -2);
                sbp.bottomMargin = dp(ctx, 4);
                card.addView(stBadge, sbp);
            }

            TextView itTv = new TextView(ctx);
            itTv.setText("Items: " + itemsSummary);
            itTv.setTextColor(Color.parseColor("#CBD5E1"));
            itTv.setTextSize(12);
            itTv.setBackground(makeBox(ctx, "#172238", "#24344D", 1f, 10, false));
            itTv.setPadding(dp(ctx, 10), dp(ctx, 8), dp(ctx, 10), dp(ctx, 8));
            LinearLayout.LayoutParams itp = new LinearLayout.LayoutParams(-1, -2);
            itp.topMargin = dp(ctx, 6);
            itp.bottomMargin = dp(ctx, 12);
            card.addView(itTv, itp);

            LinearLayout row = new LinearLayout(ctx);
            row.setOrientation(LinearLayout.HORIZONTAL);
            if (allowRiderPass && !hasPickedUp) {
                Button bPass = makeBtn(ctx, "✕ Pass", "#172238", "#EF4444", "#EF4444");
                bPass.setOnClickListener(v -> listener.onPassTrip(trip, "Rider declined"));
                row.addView(bPass, new LinearLayout.LayoutParams(0, dp(ctx, 46), 1f));
            }
            Button bAccept = makeBtn(ctx, "✓ Accept (+₹" + Math.round(totalFee) + ")", "#16A34A", "#FFFFFF", "#16A34A");
            LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(ctx, 46), 1.5f);
            ap.leftMargin = dp(ctx, 8);
            row.addView(bAccept, ap);
            bAccept.setOnClickListener(v -> listener.onAcceptTrip(trip));
            card.addView(row);
            return card;
        }

        // ACCEPTED CARD
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
        for (TripHelper.OrderData o : sortedStops) {
            if (!"PICKED_UP".equals(o.status) && !"OUT_FOR_DELIVERY".equals(o.status)) {
                allPickedUp = false;
                break;
            }
        }

        card.setBackground(makeBox(ctx, "#0F172A", allPickedUp ? "#16A34A" : "#3B82F6", 1.8f, 22, false));

        LinearLayout header = new LinearLayout(ctx);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(-1, -2);
        hlp.bottomMargin = dp(ctx, 10);
        header.setLayoutParams(hlp);

        TextView hTitle = new TextView(ctx);
        hTitle.setText((trip.orders.size() > 1 ? "🏪 " + trip.orders.size() + "-STORES TRIP" : "SINGLE STORE TRIP")
                + "\nEarning: +₹" + Math.round(totalFee));
        hTitle.setTextColor(Color.WHITE);
        hTitle.setTextSize(14);
        hTitle.setTypeface(null, Typeface.BOLD);
        header.addView(hTitle, new LinearLayout.LayoutParams(0, -2, 1f));
        header.addView(makePill(ctx, allPickedUp ? "DOORSTEP ROUTE" : "PICKING STORES",
                allPickedUp ? "#0C291B" : "#102847", allPickedUp ? "#34D399" : "#60A5FA", allPickedUp ? "#16A34A" : "#3B82F6"));
        card.addView(header);

        boolean shownActiveStore = false;
        for (int i = 0; i < sortedStops.size(); i++) {
            final TripHelper.OrderData o = sortedStops.get(i);
            boolean isPicked = "PICKED_UP".equals(o.status) || "OUT_FOR_DELIVERY".equals(o.status);
            TripHelper.StoreData st = storesMap.get(o.restaurantId);
            String stName = st != null ? st.name : "Store";
            String stAddr = st != null ? st.address : "Gossaigaon Bazar";
            String stPhone = st != null ? st.phone : "";

            StringBuilder stopItemsTxt = new StringBuilder();
            for (TripHelper.OrderItem it : o.items) {
                if (stopItemsTxt.length() > 0) stopItemsTxt.append(", ");
                stopItemsTxt.append(it.qty).append("× ").append(it.name);
            }

            LinearLayout stopBox = new LinearLayout(ctx);
            stopBox.setOrientation(LinearLayout.VERTICAL);
            stopBox.setPadding(dp(ctx, 12), dp(ctx, 12), dp(ctx, 12), dp(ctx, 12));
            LinearLayout.LayoutParams sbp = new LinearLayout.LayoutParams(-1, -2);
            sbp.bottomMargin = dp(ctx, 10);
            stopBox.setLayoutParams(sbp);

            if (isPicked) {
                stopBox.setBackground(makeBox(ctx, "#091E1A", "#10B981", 1.2f, 16, false));
                stopBox.addView(makePill(ctx, "✓ STOP " + (i + 1) + ": PICKED UP", "#15803D", "#FFFFFF", "#15803D"));
                TextView stTv = new TextView(ctx);
                stTv.setText(stName);
                stTv.setTextColor(Color.WHITE);
                stTv.setTextSize(14);
                stTv.setTypeface(null, Typeface.BOLD);
                stTv.setPadding(0, dp(ctx, 4), 0, 0);
                stopBox.addView(stTv);
            } else if (!shownActiveStore) {
                shownActiveStore = true;
                stopBox.setBackground(makeBox(ctx, "#111E36", "#3B82F6", 1.5f, 16, false));

                LinearLayout sTop = new LinearLayout(ctx);
                sTop.setOrientation(LinearLayout.HORIZONTAL);
                sTop.setGravity(Gravity.CENTER_VERTICAL);
                sTop.addView(makePill(ctx, "STOP " + (i + 1) + ": PICKUP HERE", "#1D4ED8", "#FFFFFF", "#1D4ED8"));
                double d = st != null ? TripHelper.calculateDistanceKm(riderLat, riderLng, st.lat, st.lng) : -1;
                if (d >= 0) {
                    TextView dTv = new TextView(ctx);
                    dTv.setText(String.format(Locale.US, "  ~%.1f km", d));
                    dTv.setTextColor(Color.parseColor("#60A5FA"));
                    dTv.setTextSize(12);
                    dTv.setTypeface(null, Typeface.BOLD);
                    sTop.addView(dTv);
                }
                stopBox.addView(sTop);

                TextView stNameTv = new TextView(ctx);
                stNameTv.setText(stName);
                stNameTv.setTextColor(Color.WHITE);
                stNameTv.setTextSize(16);
                stNameTv.setTypeface(null, Typeface.BOLD);
                stNameTv.setPadding(0, dp(ctx, 6), 0, dp(ctx, 2));
                stopBox.addView(stNameTv);

                TextView addrTv = new TextView(ctx);
                addrTv.setText(stAddr);
                addrTv.setTextColor(Color.parseColor("#94A3B8"));
                addrTv.setTextSize(12);
                addrTv.setPadding(0, 0, 0, dp(ctx, 8));
                stopBox.addView(addrTv);

                LinearLayout linkRow = new LinearLayout(ctx);
                linkRow.setOrientation(LinearLayout.HORIZONTAL);
                Button bMap = makeBtn(ctx, "🗺️ Store Maps", "#1D4ED8", "#FFFFFF", "#3B82F6");
                bMap.setOnClickListener(v -> listener.onOpenMaps(st != null ? st.lat : 26.4524, st != null ? st.lng : 89.9723, stName));
                linkRow.addView(bMap, new LinearLayout.LayoutParams(0, dp(ctx, 38), 1f));
                if (!stPhone.isEmpty()) {
                    Button bCall = makeBtn(ctx, "📞 Call Store", "#202D45", "#FFFFFF", "#24344D");
                    LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 1f);
                    cp.leftMargin = dp(ctx, 8);
                    bCall.setOnClickListener(v -> listener.onDialPhone(stPhone));
                    linkRow.addView(bCall, cp);
                }
                stopBox.addView(linkRow);

                LinearLayout codeBox = new LinearLayout(ctx);
                codeBox.setOrientation(LinearLayout.HORIZONTAL);
                codeBox.setGravity(Gravity.CENTER_VERTICAL);
                codeBox.setBackground(makeBox(ctx, "#0B1F33", "#38BDF8", 1.5f, 12, true));
                codeBox.setPadding(dp(ctx, 12), dp(ctx, 10), dp(ctx, 12), dp(ctx, 10));
                LinearLayout.LayoutParams cbp = new LinearLayout.LayoutParams(-1, -2);
                cbp.topMargin = dp(ctx, 10);
                codeBox.setLayoutParams(cbp);

                TextView cLeft = new TextView(ctx);
                cLeft.setText("📦 STORE PICKUP CODE\nShow to storekeeper");
                cLeft.setTextColor(Color.parseColor("#38BDF8"));
                cLeft.setTextSize(11);
                cLeft.setTypeface(null, Typeface.BOLD);
                codeBox.addView(cLeft, new LinearLayout.LayoutParams(0, -2, 1f));

                TextView cRight = new TextView(ctx);
                cRight.setText(TripHelper.getStorePickupCode(o));
                cRight.setTextColor(Color.parseColor("#38BDF8"));
                cRight.setTextSize(20);
                cRight.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
                cRight.setBackground(makeBox(ctx, "#050811", "#24344D", 1f, 8, false));
                cRight.setPadding(dp(ctx, 12), dp(ctx, 4), dp(ctx, 12), dp(ctx, 4));
                codeBox.addView(cRight);
                stopBox.addView(codeBox);

                TextView sItems = new TextView(ctx);
                sItems.setText("Items: " + stopItemsTxt);
                sItems.setTextColor(Color.parseColor("#CBD5E1"));
                sItems.setTextSize(12);
                sItems.setBackground(makeBox(ctx, "#090E1A", "#24344D", 1f, 10, false));
                sItems.setPadding(dp(ctx, 10), dp(ctx, 8), dp(ctx, 10), dp(ctx, 8));
                LinearLayout.LayoutParams sip = new LinearLayout.LayoutParams(-1, -2);
                sip.topMargin = dp(ctx, 8);
                stopBox.addView(sItems, sip);

                if ("READY_FOR_PICKUP".equals(o.status)) {
                    Button bPick = makeBtn(ctx, "📦 Confirm Picked Up", "#16A34A", "#FFFFFF", "#16A34A");
                    LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-1, dp(ctx, 46));
                    pp.topMargin = dp(ctx, 10);
                    bPick.setOnClickListener(v -> listener.onConfirmStorePickup(o.orderId));
                    stopBox.addView(bPick, pp);
                } else {
                    Button bWait = makeBtn(ctx, "🔒 Waiting for Store Ready (" + o.status + ")", "#172238", "#F59E0B", "#F59E0B");
                    bWait.setEnabled(false);
                    LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(ctx, 42));
                    wp.topMargin = dp(ctx, 10);
                    stopBox.addView(bWait, wp);
                }
            } else {
                stopBox.setBackground(makeBox(ctx, "#090E1A", "#334155", 1.2f, 16, true));
                stopBox.addView(makePill(ctx, "🔒 STOP " + (i + 1) + ": NEXT STORE", "#334155", "#94A3B8", "#334155"));
                TextView stTv = new TextView(ctx);
                stTv.setText(stName);
                stTv.setTextColor(Color.parseColor("#94A3B8"));
                stTv.setTextSize(14);
                stTv.setTypeface(null, Typeface.BOLD);
                stTv.setPadding(0, dp(ctx, 4), 0, 0);
                stopBox.addView(stTv);
            }
            card.addView(stopBox);
        }

        LinearLayout custBox = new LinearLayout(ctx);
        custBox.setOrientation(LinearLayout.VERTICAL);
        custBox.setPadding(dp(ctx, 12), dp(ctx, 12), dp(ctx, 12), dp(ctx, 12));

        if (!allPickedUp) {
            custBox.setBackground(makeBox(ctx, "#090E1A", "#334155", 1.2f, 16, true));
            custBox.addView(makePill(ctx, "🔒 FINAL STOP: CUSTOMER (LOCKED)", "#334155", "#94A3B8", "#334155"));
            TextView lockMsg = new TextView(ctx);
            lockMsg.setText("Pickup store items first to unlock doorstep route.");
            lockMsg.setTextColor(Color.parseColor("#94A3B8"));
            lockMsg.setTextSize(12);
            lockMsg.setPadding(0, dp(ctx, 6), 0, 0);
            custBox.addView(lockMsg);
        } else {
            custBox.setBackground(makeBox(ctx, "#0B2218", "#16A34A", 1.5f, 16, false));

            double cDist = TripHelper.calculateDistanceKm(riderLat, riderLng, trip.customerLat, trip.customerLng);
            LinearLayout cTop = new LinearLayout(ctx);
            cTop.setOrientation(LinearLayout.HORIZONTAL);
            cTop.setGravity(Gravity.CENTER_VERTICAL);
            cTop.addView(makePill(ctx, "🏠 FINAL STOP: DELIVER TO CUSTOMER", "#15803D", "#FFFFFF", "#15803D"));
            if (cDist >= 0) {
                TextView dTv = new TextView(ctx);
                dTv.setText(String.format(Locale.US, "  ~%.1f km", cDist));
                dTv.setTextColor(Color.parseColor("#34D399"));
                dTv.setTextSize(12);
                dTv.setTypeface(null, Typeface.BOLD);
                cTop.addView(dTv);
            }
            custBox.addView(cTop);

            TextView ca = new TextView(ctx);
            ca.setText(trip.address);
            ca.setTextColor(Color.WHITE);
            ca.setTextSize(15);
            ca.setTypeface(null, Typeface.BOLD);
            ca.setPadding(0, dp(ctx, 6), 0, dp(ctx, 8));
            custBox.addView(ca);

            LinearLayout cRow = new LinearLayout(ctx);
            cRow.setOrientation(LinearLayout.HORIZONTAL);
            Button bCMap = makeBtn(ctx, "🗺️ Maps Nav", "#16A34A", "#FFFFFF", "#16A34A");
            bCMap.setOnClickListener(v -> listener.onOpenMaps(trip.customerLat, trip.customerLng, trip.address));
            cRow.addView(bCMap, new LinearLayout.LayoutParams(0, dp(ctx, 38), 1.2f));
            if (!trip.phone.isEmpty()) {
                Button bCCall = makeBtn(ctx, "📞 Call", "#202D45", "#FFFFFF", "#24344D");
                LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 0.8f);
                cp.leftMargin = dp(ctx, 6);
                bCCall.setOnClickListener(v -> listener.onDialPhone(trip.phone));
                cRow.addView(bCCall, cp);

                Button bCWa = makeBtn(ctx, "💬 WhatsApp", "#064E3B", "#34D399", "#10B981");
                LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 1f);
                wp.leftMargin = dp(ctx, 6);
                bCWa.setOnClickListener(v -> listener.onOpenWhatsApp(trip.phone));
                cRow.addView(bCWa, wp);
            }
            custBox.addView(cRow);

            LinearLayout payBox = new LinearLayout(ctx);
            payBox.setOrientation(LinearLayout.HORIZONTAL);
            payBox.setGravity(Gravity.CENTER_VERTICAL);
            if (isPrepaid) {
                payBox.setBackground(makeBox(ctx, "#0C2538", "#38BDF8", 1.2f, 14, false));
            } else if ("UPI".equals(trip.paymentMode)) {
                payBox.setBackground(makeBox(ctx, "#291E0B", "#EF4444", 1.5f, 14, true));
            } else {
                payBox.setBackground(makeBox(ctx, "#0C291B", "#16A34A", 1.5f, 14, true));
            }
            payBox.setPadding(dp(ctx, 12), dp(ctx, 10), dp(ctx, 12), dp(ctx, 10));
            LinearLayout.LayoutParams pbp = new LinearLayout.LayoutParams(-1, -2);
            pbp.topMargin = dp(ctx, 10);
            payBox.setLayoutParams(pbp);

            TextView pLeft = new TextView(ctx);
            String pStatusTxt = "WALLET".equals(trip.paymentMode) ? "Wallet Paid"
                    : ("UPI".equals(trip.paymentMode) ? (isPrepaid ? "UPI Online Paid" : "UPI Unverified") : "Cash on Delivery");
            pLeft.setText("PAYMENT\n" + pStatusTxt);
            pLeft.setTextColor(Color.WHITE);
            pLeft.setTextSize(13);
            pLeft.setTypeface(null, Typeface.BOLD);
            payBox.addView(pLeft, new LinearLayout.LayoutParams(0, -2, 1f));

            TextView pRight = new TextView(ctx);
            pRight.setText("₹" + Math.round(totalBill));
            pRight.setTextColor(Color.parseColor(isPrepaid ? "#38BDF8" : "#16A34A"));
            pRight.setTextSize(22);
            pRight.setTypeface(null, Typeface.BOLD);
            payBox.addView(pRight);
            custBox.addView(payBox);

            boolean isOut = false;
            for (TripHelper.OrderData o : trip.orders) if ("OUT_FOR_DELIVERY".equals(o.status)) isOut = true;

            final double finalBill = totalBill;
            if (!isOut) {
                Button bStart = makeBtn(ctx, "🛵 Start Doorstep Route", "#38BDF8", "#000000", "#38BDF8");
                LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(ctx, 48));
                sp.topMargin = dp(ctx, 10);
                bStart.setOnClickListener(v -> listener.onStartDoorstepRoute(trip));
                custBox.addView(bStart, sp);
            } else {
                Button bPin = makeBtn(ctx, "🔑 Enter Customer PIN & Complete", "#10B981", "#FFFFFF", "#10B981");
                LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-1, dp(ctx, 48));
                pp.topMargin = dp(ctx, 10);
                bPin.setOnClickListener(v -> listener.onShowPinDialog(trip, finalBill, isPrepaid));
                custBox.addView(bPin, pp);
            }
        }
        card.addView(custBox);

        LinearLayout bottomRow = new LinearLayout(ctx);
        bottomRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams brp = new LinearLayout.LayoutParams(-1, -2);
        brp.topMargin = dp(ctx, 12);
        bottomRow.setLayoutParams(brp);

        if (allowRiderSos) {
            Button bSos = makeBtn(ctx, "⚠️ Road Issue", "#0F172A", "#F59E0B", "#F59E0B");
            bSos.setOnClickListener(v -> listener.onShowSosDialog(trip));
            bottomRow.addView(bSos, new LinearLayout.LayoutParams(0, dp(ctx, 38), 1f));
        }

        if (hasPickedUp) {
            TextView lockTv = new TextView(ctx);
            lockTv.setText("🔒 Picked Up (Cancel Locked)");
            lockTv.setTextColor(Color.parseColor("#94A3B8"));
            lockTv.setTextSize(11);
            lockTv.setTypeface(null, Typeface.BOLD);
            lockTv.setGravity(Gravity.CENTER);
            lockTv.setBackground(makeBox(ctx, "#172238", "#24344D", 1f, 10, false));
            LinearLayout.LayoutParams lpLock = new LinearLayout.LayoutParams(0, dp(ctx, 38), 1.3f);
            lpLock.leftMargin = dp(ctx, 8);
            bottomRow.addView(lockTv, lpLock);
        } else if (allowRiderPass) {
            Button bPassTrip = makeBtn(ctx, "🚫 Pass Trip", "#0F172A", "#EF4444", "#EF4444");
            LinearLayout.LayoutParams ptp = new LinearLayout.LayoutParams(0, dp(ctx, 38), 1f);
            ptp.leftMargin = dp(ctx, 8);
            bPassTrip.setOnClickListener(v -> listener.onShowPassDialog(trip));
            bottomRow.addView(bPassTrip, ptp);
        }

        card.addView(bottomRow);
        return card;
    }

    public static String shortId(String s) {
        return s != null && s.length() > 6 ? s.substring(s.length() - 6) : (s != null ? s : "");
    }

    public static int dp(Context ctx, float v) {
        return Math.round(v * ctx.getResources().getDisplayMetrics().density);
    }

    public static float dpF(Context ctx, float v) {
        return v * ctx.getResources().getDisplayMetrics().density;
    }
}
