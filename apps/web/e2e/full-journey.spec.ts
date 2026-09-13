import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Parcours de bout en bout, versionné (étape 15) — remplace les scripts
 * ad hoc écrits (et jetés) à chaque étape précédente. Couvre, avec de
 * vraies sessions navigateur et les vraies API existantes (jamais de
 * manipulation directe de la base pour simuler un résultat) :
 *
 *   patient · médecin · admin · réservation · notification ·
 *   email (via Mailpit, si le profil "mail" est actif) · annulation ·
 *   vérification médecin · visibilité publique
 *
 * Prérequis : `docker compose --profile mail up -d` (voir playwright.config.ts
 * et le README de ce dossier). Sans le profil "mail", l'assertion email est
 * ignorée avec un avertissement plutôt que d'échouer.
 *
 * Nettoyage : ce test crée de vrais comptes dans la base de DÉVELOPPEMENT
 * (celle servie par la pile Docker), avec des emails horodatés et un
 * domaine dédié (`@e2e.medilink.local`) pour rester facilement identifiables
 * et supprimables — voir le README de ce dossier pour la procédure de
 * nettoyage (pas d'API de suppression de compte exposée volontairement).
 */

const API = "http://localhost:4000";
const MAILPIT = "http://localhost:8025";
const ADMIN_EMAIL = "admin@medilink.local";
const ADMIN_PASSWORD = "Password123!";
const PASSWORD = "correct-horse-battery";

const suffix = Date.now();
const doctorEmail = `doctor-${suffix}@e2e.medilink.local`;
const patientEmail = `patient-${suffix}@e2e.medilink.local`;

async function apiCall<T>(request: APIRequestContext, path: string, options: Parameters<APIRequestContext["fetch"]>[1] = {}): Promise<T> {
  const res = await request.fetch(`${API}${path}`, options);
  if (!res.ok()) {
    throw new Error(`API ${options.method ?? "GET"} ${path} -> ${res.status()}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "load" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function mailpitReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${MAILPIT}/api/v1/messages`, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

async function mailpitMessagesTo(request: APIRequestContext, address: string) {
  const res = await request.get(`${MAILPIT}/api/v1/messages?limit=100`);
  const body = (await res.json()) as { messages: { To: { Address: string }[]; Subject: string }[] };
  return body.messages.filter((m) => m.To.some((to) => to.Address === address));
}

test("parcours complet : patient, médecin, admin, réservation, notification, annulation", async ({ browser, request }) => {
  let doctorId = "";

  await test.step("Préparation : compte DOCTOR (PENDING) + profil, via l'API publique existante", async () => {
    await apiCall(request, "/api/auth/register", {
      method: "POST",
      data: { email: doctorEmail, password: PASSWORD, firstName: "Nadia", lastName: "E2EJourney-Doctor", role: "DOCTOR" },
    });
    const doctorLogin = await apiCall<{ accessToken: string }>(request, "/api/auth/login", {
      method: "POST",
      data: { email: doctorEmail, password: PASSWORD },
    });
    const [{ cities }, { specialties }] = await Promise.all([
      apiCall<{ cities: { id: string }[] }>(request, "/api/cities"),
      apiCall<{ specialties: { id: string }[] }>(request, "/api/specialties"),
    ]);
    const profile = await apiCall<{ doctor: { id: string } }>(request, "/api/doctors", {
      method: "POST",
      headers: { Authorization: `Bearer ${doctorLogin.accessToken}` },
      data: { cityId: cities[0].id, address: "1 avenue du Parcours", specialtyIds: [specialties[0].id] },
    });
    doctorId = profile.doctor.id;

    await apiCall(request, "/api/doctors/me/availability", {
      method: "POST",
      headers: { Authorization: `Bearer ${doctorLogin.accessToken}` },
      data: {
        // Jour de demain (jamais aujourd'hui) : garantit que la première
        // occurrence de la règle tombe strictement dans le futur, jamais
        // sur un horaire déjà passé de la journée en cours.
        type: "RECURRING",
        dayOfWeek: new Date(Date.now() + 86_400_000).getUTCDay(),
        startTime: "09:00",
        endTime: "12:00",
        slotDurationMinutes: 30,
        effectiveFrom: new Date().toISOString().slice(0, 10),
      },
    });

    await apiCall(request, "/api/auth/register", {
      method: "POST",
      data: { email: patientEmail, password: PASSWORD, firstName: "Yassine", lastName: "E2EJourney-Patient", role: "PATIENT" },
    });
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await test.step("Admin : connexion et vérification du médecin PENDING depuis l'interface (pas via l'API)", async () => {
    await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminPage.goto("/admin/doctors", { waitUntil: "load" });
    await adminPage.click('button:has-text("En attente")');

    const doctorRow = adminPage.locator("tr", { hasText: doctorEmail });
    await expect(doctorRow).toBeVisible();
    await doctorRow.getByRole("button", { name: "Vérifier" }).click();
    await expect(adminPage.getByText(/Médecin vérifié/)).toBeVisible();
  });

  await test.step("Visibilité publique : le médecin nouvellement vérifié apparaît dans la recherche, sans authentification, avec des créneaux réels", async () => {
    // Vérification rapide côté API (pas navigateur) que la disponibilité
    // créée produit bien au moins un créneau futur, maintenant que le
    // médecin est VERIFIED (cette route renvoie 404 tant qu'il ne l'est
    // pas) — échoue tôt avec un message clair plutôt que sur un bouton
    // introuvable côté UI plus loin dans le test.
    const today = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const availability = await apiCall<{ slots: unknown[] }>(request, `/api/doctors/${doctorId}/availability?from=${today}&to=${to}`);
    expect(availability.slots.length, "aucun créneau généré par la disponibilité de préparation").toBeGreaterThan(0);

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto("/doctors", { waitUntil: "load" });
    await publicPage.getByLabel("Nom du médecin").fill("E2EJourney-Doctor");
    await publicPage.getByRole("button", { name: "Rechercher" }).click();
    await expect(publicPage.locator('main a[href^="/doctors/"]').first()).toBeVisible();
    await publicContext.close();
  });

  const patientContext = await browser.newContext();
  const patientPage = await patientContext.newPage();

  await test.step("Patient : recherche et réservation réelle d'un créneau", async () => {
    await login(patientPage, patientEmail, PASSWORD);
    await patientPage.goto("/doctors", { waitUntil: "load" });
    await patientPage.getByLabel("Nom du médecin").fill("E2EJourney-Doctor");
    await patientPage.getByRole("button", { name: "Rechercher" }).click();

    const resultLink = patientPage.locator('main a[href^="/doctors/"]').first();
    await expect(resultLink).toBeVisible();
    await resultLink.click();

    const slotButton = patientPage.locator('button[type="button"]').filter({ hasText: /\d{2}:\d{2}/ }).first();
    await expect(slotButton).toBeVisible();
    await slotButton.click();
    await expect(patientPage.getByText("Rendez-vous confirmé avec succès.")).toBeVisible();
  });

  await test.step("Notification : le patient et le médecin voient chacun la réservation dans leur propre cloche", async () => {
    await patientPage.goto("/notifications", { waitUntil: "load" });
    await expect(patientPage.getByText("Rendez-vous confirmé")).toBeVisible();

    const doctorContext = await browser.newContext();
    const doctorPage = await doctorContext.newPage();
    await login(doctorPage, doctorEmail, PASSWORD);
    await doctorPage.goto("/notifications", { waitUntil: "load" });
    await expect(doctorPage.getByText("Rendez-vous confirmé")).toBeVisible();
    await doctorContext.close();
  });

  await test.step("Email (Mailpit, si le profil 'mail' est actif) : patient et médecin ont bien reçu un email", async () => {
    if (!(await mailpitReachable(request))) {
      console.warn("Mailpit indisponible (profil 'mail' non démarré) — assertion email ignorée, comportement attendu sans ce profil.");
      return;
    }
    const patientEmails = await mailpitMessagesTo(request, patientEmail);
    const doctorEmails = await mailpitMessagesTo(request, doctorEmail);
    expect(patientEmails.some((m) => m.Subject.includes("confirmé"))).toBe(true);
    expect(doctorEmails.some((m) => m.Subject.includes("agenda"))).toBe(true);
  });

  const doctorContext = await browser.newContext();
  const doctorPage = await doctorContext.newPage();

  await test.step("Médecin : annulation du rendez-vous depuis l'agenda", async () => {
    await login(doctorPage, doctorEmail, PASSWORD);
    await doctorPage.goto("/doctor/appointments", { waitUntil: "load" });
    doctorPage.once("dialog", (dialog) => dialog.accept());
    await doctorPage.click('button:has-text("Annuler")');
    await expect(doctorPage.getByText("Rendez-vous annulé.")).toBeVisible();
  });

  await test.step("Le patient voit le rendez-vous annulé et la notification correspondante", async () => {
    await patientPage.goto("/patient/appointments", { waitUntil: "load" });
    await expect(patientPage.getByText("Annulé")).toBeVisible();

    await patientPage.goto("/notifications", { waitUntil: "load" });
    await expect(patientPage.getByText("Rendez-vous annulé")).toBeVisible();
  });

  await adminContext.close();
  await patientContext.close();
  await doctorContext.close();
});
