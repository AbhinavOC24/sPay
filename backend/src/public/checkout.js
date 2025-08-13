(function () {
  let countdownId = null;
  let hardExpAtMs = 0;

  function expireNow() {
    setStatus("EXPIRED");
    if (hintEl) {
      hintEl.textContent = "Link expired. Return to the store.";
      hintEl.className = "err";
    }
    if (cancelBtn) cancelBtn.disabled = true;
  }

  function startCountdownFrom(meta) {
    if (meta.expiresAt) hardExpAtMs = new Date(meta.expiresAt).getTime();
    else if (typeof meta.remainingSec === "number")
      hardExpAtMs = Date.now() + meta.remainingSec * 1000;
    else hardExpAtMs = 0;

    if (countdownId) clearInterval(countdownId);
    if (!hardExpAtMs) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((hardExpAtMs - Date.now()) / 1000));
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      if (timerEl) timerEl.textContent = "Expires in " + mm + ":" + ss;

      if (
        left <= 0 &&
        (lastStatus === "PENDING" || lastStatus === "DETECTED")
      ) {
        clearInterval(countdownId);
        expireNow();
      }
    };
    tick();
    countdownId = setInterval(tick, 1000);
  }

  console.log("🚀 Checkout script starting...");

  const chargeId = location.pathname.split("/").pop();
  console.log("📋 Charge ID:", chargeId);

  const qrEl = document.getElementById("qr");
  const addrEl = document.getElementById("addr");
  const amtEl = document.getElementById("amt");
  const stEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const timerEl = document.getElementById("timer");
  const cancelBtn = document.getElementById("cancelBtn");
  const copyAddr = document.getElementById("copyAddr");
  const copyAmt = document.getElementById("copyAmt");

  // Debug: Log all elements
  console.log("🔍 Elements found:");
  console.log("- qrEl:", !!qrEl);
  console.log("- addrEl:", !!addrEl);
  console.log("- amtEl:", !!amtEl);
  console.log("- stEl:", !!stEl);
  console.log("- hintEl:", !!hintEl);
  console.log("- timerEl:", !!timerEl);
  console.log("- cancelBtn:", !!cancelBtn);
  console.log("- copyAddr:", !!copyAddr);
  console.log("- copyAmt:", !!copyAmt);

  if (!cancelBtn) {
    console.error("❌ CRITICAL: Cancel button not found!");
    console.log("🔍 Available elements with 'cancel' in ID:");
    document.querySelectorAll("[id*='cancel']").forEach((el) => {
      console.log("- Found element:", el.tagName, "id:", el.id);
    });
    console.log("🔍 All buttons on page:");
    document.querySelectorAll("button").forEach((el) => {
      console.log(
        "- Button:",
        el.tagName,
        "id:",
        el.id,
        "class:",
        el.className
      );
    });
  }

  let cancelUrl = "";
  let successUrl = "";
  let lastStatus = "PENDING";

  const fmt = (v) => {
    const n = Number(v);
    return Number.isFinite(n)
      ? (n / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
      : String(v);
  };

  const setStatus = (status) => {
    console.log("🔄 Setting status:", status);
    const cls =
      {
        PENDING: "muted",
        DETECTED: "warn",
        CONFIRMED: "ok",
        UNDERPAID: "err",
        EXPIRED: "err",
        CANCELLED: "err",
      }[status] || "muted";
    if (stEl) {
      stEl.textContent = "Status: " + status;
      stEl.className = "status " + cls;
    }

    // enable/disable cancel button based on status
    const canCancel = status === "PENDING";
    if (cancelBtn) {
      cancelBtn.disabled = !canCancel;
      cancelBtn.title = canCancel
        ? ""
        : "You can only cancel while the charge is pending.";
      console.log("🔄 Cancel button disabled:", !canCancel);
    }
  };

  function render(c) {
    if (!c) return;
    console.log("🎨 Rendering charge data:", c);

    if (addrEl) addrEl.textContent = c.address || "—";
    if (amtEl) amtEl.textContent = fmt(c.amount);
    setStatus(c.status);
    console.log("Cancel Url:", c.cancel_url);
    cancelUrl = c.cancel_url ?? cancelUrl;
    successUrl = c.success_url ?? successUrl;

    const secs = Math.max(0, Number(c.remainingSec || 0));
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    if (timerEl) timerEl.textContent = "Expires in " + mm + ":" + ss;
    startCountdownFrom(c);
    if (c.status === "EXPIRED") {
      expireNow();
      return;
    }
    if (hintEl) {
      if (c.status === "PENDING") {
        hintEl.textContent = "Waiting for payment…";
        hintEl.className = "muted";
      } else if (c.status === "DETECTED") {
        hintEl.textContent = "Payment detected. Finalizing…";
        hintEl.className = "warn";
      } else if (c.status === "EXPIRED") {
        expireNow();
        return;
      } else if (c.status === "CONFIRMED") {
        hintEl.textContent = "Payment successful ✓";
        hintEl.className = "ok";
        if (lastStatus !== "CONFIRMED" && successUrl) {
          const u = new URL(successUrl);
          u.searchParams.set("charge_id", c.chargeId);
          if (c.txid) u.searchParams.set("txid", c.txid);
          u.searchParams.set("status", "CONFIRMED");
          setTimeout(() => {
            location.href = u.toString();
          }, 1200);
        }
      } else if (c.status === "CANCELLED") {
        hintEl.textContent = "Checkout cancelled.";
        hintEl.className = "err";
        if (cancelUrl)
          setTimeout(() => {
            location.href = cancelUrl;
          }, 400);
      } else if (c.status === "UNDERPAID") {
        hintEl.textContent = "Amount too low. Contact the merchant.";
        hintEl.className = "err";
      } else {
        hintEl.textContent = "Link expired. Return to the store.";
        hintEl.className = "err";
      }
    }

    lastStatus = c.status;
  }

  // static setup
  if (qrEl) qrEl.src = `/charges/${chargeId}/qr.png`;
  if (copyAddr) {
    copyAddr.onclick = async () => {
      await navigator.clipboard.writeText(addrEl.textContent.trim());
      copyAddr.textContent = "Copied!";

      setTimeout(() => (copyAddr.textContent = "Copy Address"), 1200);
    };
  }
  if (copyAmt) {
    copyAmt.onclick = () => {
      navigator.clipboard.writeText(amtEl.textContent.trim());
      copyAmt.textContent = "Copied!";

      setTimeout(() => (copyAmt.textContent = "Copy Amount"), 1200);
    };
  }

  // Cancel button handler
  if (cancelBtn) {
    console.log("✅ Cancel button found, attaching event listener");
    console.log("🔍 Cancel button details:", {
      tagName: cancelBtn.tagName,
      id: cancelBtn.id,
      className: cancelBtn.className,
      disabled: cancelBtn.disabled,
    });

    // Add event listener
    const handleCancel = async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (cancelBtn.disabled) return;

      cancelBtn.disabled = true;
      cancelBtn.textContent = "Cancelling...";

      try {
        console.log(`📤 Sending POST to: /charges/${chargeId}/cancel`);
        const response = await axios.post(`/charges/${chargeId}/cancel`);
        console.log("✅ Cancel response:", response.data);

        // Redirect immediately if cancelUrl is set
        if (cancelUrl) {
          window.location.href = cancelUrl;
        } else {
          console.warn("⚠️ No cancelUrl set; staying on page");
        }
      } catch (error) {
        console.error("❌ Cancel error:", error);
        cancelBtn.disabled = false;
        cancelBtn.textContent = "Cancel";

        if (hintEl) {
          hintEl.textContent =
            error.response?.data?.error || "Could not cancel the charge";
          hintEl.className = "err";
        }
      }
    };

    // Attach the event listener
    cancelBtn.addEventListener("click", handleCancel);
    console.log("✅ Event listener attached to cancel button");
  } else {
    console.error("❌ Cancel button not found! Check HTML element ID");
  }

  // initial snapshot
  console.log("📡 Loading initial charge data...");
  axios
    .get(`/charges/${chargeId}`, { headers: { "Cache-Control": "no-store" } })
    .then((res) => {
      console.log("✅ Initial charge data loaded:", res.data);
      render(res.data);
    })
    .catch((err) => {
      console.error("❌ Failed to load initial charge data:", err);
    });

  // live SSE
  console.log("🔄 Opening SSE connection...");
  const es = new EventSource(`/charges/${chargeId}/events`);

  es.addEventListener("charge.updated", (e) => {
    console.log("📡 SSE charge.updated event received:", e.data);
    try {
      const data = JSON.parse(e.data);
      render(data);
    } catch (err) {
      console.error("❌ Error parsing SSE data:", err);
    }
  });

  es.onerror = (err) => {
    console.error("❌ SSE connection error:", err);
    es.close();
    console.log("🔄 Falling back to polling...");

    // fallback polling
    setInterval(async () => {
      try {
        const res = await axios.get(`/charges/${chargeId}`, {
          headers: { "Cache-Control": "no-store" },
        });
        render(res.data);
      } catch (pollErr) {
        console.error("❌ Polling error:", pollErr);
      }
    }, 5000);
  };

  es.onopen = () => {
    console.log("✅ SSE connection opened");
  };

  console.log("🚀 Checkout script initialization complete");
})();
