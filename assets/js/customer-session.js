import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

window.customerAuthReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => resolve(user));
});

window.getCustomerIdToken = async () => {
  const user = await window.customerAuthReady;
  if (!user) throw new Error("No authenticated customer session.");
  return user.getIdToken();
};
