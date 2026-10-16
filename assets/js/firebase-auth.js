import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const loginForm = document.querySelector("[data-admin-login]");
const loginStatus = document.querySelector("[data-login-status]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");
const accountLabels = document.querySelectorAll("[data-admin-account]");
const isLoginPage = Boolean(loginForm);

const setLoginStatus = (message) => {
  if (loginStatus) loginStatus.textContent = message;
};

const adminLoginPath = "/admin/login/";
const adminPath = "/admin/";

async function getAdminIdToken() {
  if (window.adminAuthReady) {
    await window.adminAuthReady;
  }

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated admin session.");
  return user.getIdToken();
}

window.getAdminIdToken = getAdminIdToken;
window.adminAuthReady = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  });
});

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginForm.elements.namedItem("email")?.value.trim() || "";
    const password = loginForm.elements.namedItem("password")?.value || "";
    const submitButton = loginForm.querySelector("button[type=submit]");
    if (submitButton) submitButton.disabled = true;
    setLoginStatus("Signing in…");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/admin-auth-check", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.data?.authorized) {
        await signOut(auth);
        throw new Error(response.status === 403 ? "This Firebase account is not authorized for the Admin area." : "Unable to verify administrator access.");
      }
      setLoginStatus("Signed in. Opening admin dashboard…");
      window.location.assign(adminPath);
    } catch (error) {
      const message = error?.code === "auth/invalid-credential"
        ? "The email or password is incorrect."
        : error?.message || "Unable to sign in. Check your details and try again.";
      setLoginStatus(message);
      if (submitButton) submitButton.disabled = false;
    }
  });
}

logoutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await signOut(auth);
      window.location.assign(adminLoginPath);
    } catch {
      button.disabled = false;
    }
  });
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    accountLabels.forEach((element) => {
      element.textContent = user.email || "Admin account";
    });

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin-auth-check", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.success || !payload.data?.authorized) {
        await signOut(auth);
        if (isLoginPage) setLoginStatus("This Firebase account is not authorized for the Admin area.");
        else window.location.replace(adminLoginPath);
        return;
      }

      if (isLoginPage) window.location.assign(adminPath);
    } catch {
      await signOut(auth);
      if (isLoginPage) setLoginStatus("Unable to verify administrator access. Please try again.");
      else window.location.replace(adminLoginPath);
    }
    return;
  }

  if (!isLoginPage) window.location.replace(adminLoginPath);
});