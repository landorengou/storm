(function () {
  const KEY = "storm_email";
  const ENDPOINT = "/api/register";

  function isValid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function getSaved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function addStyle() {
    if (document.getElementById("gate-style")) return;
    const style = document.createElement("style");
    style.id = "gate-style";
    style.textContent = `
      #gate{position:fixed;inset:0;z-index:99999;background:#111;color:#fff;
        display:flex;align-items:center;justify-content:center;padding:16px;
        font-family:sans-serif}
      #gate .box{background:#222;padding:24px;border-radius:12px;max-width:380px;width:100%}
      #gate input{width:100%;padding:10px;margin:12px 0;box-sizing:border-box;font-size:16px}
      #gate button{width:100%;padding:10px;font-size:16px;cursor:pointer}
      #gate .err{color:#ff7b7b;min-height:1.2em;font-size:14px}
      #gate small{color:#aaa;display:block;margin-top:10px}
      #switch-account{position:fixed;right:12px;bottom:12px;z-index:9999;
        padding:8px 12px;font-size:13px;cursor:pointer;opacity:.85}
    `;
    document.head.appendChild(style);
  }

  // 登録画面を表示する
  function showGate() {
    addStyle();
    const old = document.getElementById("switch-account");
    if (old) old.remove();

    const gate = document.createElement("div");
    gate.id = "gate";
    gate.innerHTML = `
      <div class="box">
        <h2>メールアドレスの登録</h2>
        <p>ご利用にはメールアドレスの登録が必要です。</p>
        <input type="email" id="gate-email" placeholder="example@mail.com" autocomplete="email">
        <div class="err" id="gate-err"></div>
        <button id="gate-btn">登録して利用する</button>
        <small>不正利用対策(BAN対応)のために使用します。それ以外の目的には使いません。</small>
      </div>`;
    document.documentElement.appendChild(gate);
    document.body.style.overflow = "hidden";

    document.getElementById("gate-btn").addEventListener("click", async () => {
      const email = document.getElementById("gate-email").value.trim();
      const err = document.getElementById("gate-err");
      if (!isValid(email)) {
        err.textContent = "正しいメールアドレスを入力してください。";
        return;
      }
      if (ENDPOINT) {
        try {
          const r = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
          if (!r.ok) throw new Error("failed");
        } catch (e) {
          err.textContent = "送信に失敗しました。もう一度お試しください。";
          return;
        }
      }
      try { localStorage.setItem(KEY, email); } catch (e) {}
      window.location.href = "kiyaku.html";
    });
  }

  // 登録済みのときに出す「別のアカウントで登録する」ボタン
  function showSwitchButton() {
    addStyle();
    const btn = document.createElement("button");
    btn.id = "switch-account";
    btn.textContent = "別のアカウントで登録する";
    btn.addEventListener("click", () => {
      try { localStorage.removeItem(KEY); } catch (e) {}
      showGate();
    });
    document.body.appendChild(btn);
  }

  function init() {
    if (getSaved()) {
      showSwitchButton();
    } else {
      showGate();
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();