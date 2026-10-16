const link = document.querySelector(".account-link");

if (link) {
  link.href = "account.html";
  link.setAttribute("aria-label", "Account");
  link.querySelector(".account-label")?.replaceChildren(document.createTextNode("Account"));
}
