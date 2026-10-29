'use strict';

/**
 * The tutorial itself — narration and actions in one place.
 *
 * Narration and the click that goes with it live in the same function on purpose: they
 * are the thing most likely to drift apart, and a storyboard kept in a separate document
 * goes stale the first time a selector changes. `plan/storyboard.md` is GENERATED from
 * the `meta` blocks here (npm run storyboard), so the plan and the recording cannot
 * disagree.
 *
 * Every beat is `d.say(english, hindi)`. The Hindi is a spoken-register translation, not
 * a literal one, and it keeps the English product nouns a lab in India actually says out
 * loud — "Master Test List", "Group", "SubGroup", "OTP", "report" — rather than coining
 * Sanskritised equivalents nobody uses at a reception desk.
 *
 * Locators are role/text/label based wherever the markup allows it, with two rules this
 * codebase forces:
 *
 *  1. **Never match a button name exactly.** Font Awesome renders its glyph through a
 *     `::before`, and the accessible-name computation includes pseudo content — so the
 *     Add button's name is "+ Add" and Next's is "Next ➜". Playwright's default
 *     (`exact` off) substring match is correct here; `exact: true` and anchored regexes
 *     both find nothing. Scope to a container where a substring would be ambiguous
 *     ("Add" vs "Add New Patient").
 *  2. **Prefer placeholders inside the Add dialog.** Its fields are wrapped in `dc-field`,
 *     which generates the `name` attribute (`dc-field-ge18tt3`), so there is no stable
 *     name or id to bind to. The placeholders ("e.g., HAEMATOLOGY", "0.00") are the
 *     author-written, human-meaningful hook.
 */

const APP = process.env.APP_URL || 'http://127.0.0.1:4299';

const sections = [

  // ── 1. Introduction ───────────────────────────────────────────────────────
  {
    id: 'intro',
    title: 'Introduction',
    titleHi: 'परिचय',
    meta: {
      onScreen: 'Full-screen title card over a dark gradient.',
      clicks: 'None.',
      highlight: 'Product name and the three things the tutorial will cover.',
      expect: 'Viewer knows what DiagnoCare is and what they are about to see.',
      seconds: 38,
    },
    async run(d, page) {
      await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
      await d.wait(1200);
      await d.titleCard({
        kicker: 'Product Tutorial',
        title: 'DiagnoCare',
        titleHi: 'पैथोलॉजी लैब प्रबंधन',
        subtitle: 'Pathology laboratory management — from the front desk to the signed report',
        subtitleHi: 'रिसेप्शन से लेकर साइन किए गए रिपोर्ट तक',
        narration: [
          ['DiagnoCare is a management system for a pathology laboratory.',
           'DiagnoCare एक पैथोलॉजी लैब चलाने के लिए बनाया गया सिस्टम है।'],
          ['It carries a patient from the moment they reach the front desk, through sample collection and result entry, to a verified report.',
           'यह मरीज़ को रिसेप्शन से शुरू करके, सैंपल कलेक्शन और रिज़ल्ट एंट्री से होते हुए, वेरिफ़ाई की गई रिपोर्ट तक ले जाता है।'],
          ['In this walkthrough we will sign in, work through the patient list, register a new patient, and set up the test catalogue the whole application is built on.',
           'इस वीडियो में हम लॉगिन करेंगे, पेशेंट लिस्ट देखेंगे, एक नया मरीज़ रजिस्टर करेंगे, और वह टेस्ट कैटलॉग बनाएँगे जिस पर पूरा ऐप्लिकेशन टिका है।'],
        ],
      });
    },
  },

  // ── 2. Sign in ────────────────────────────────────────────────────────────
  {
    id: 'login',
    title: 'Signing in',
    titleHi: 'लॉगिन',
    meta: {
      onScreen: 'Login page, then the one-time-password dialog.',
      clicks: 'User Name, Password, Generate OTP & Continue, the six OTP boxes.',
      highlight: 'That a second factor is always required, never optional.',
      expect: 'Session established; the app lands on the laboratory home.',
      seconds: 64,
    },
    async run(d, page) {
      await d.titleCard({ kicker: 'Chapter 1', title: 'Signing in', titleHi: 'लॉगिन करना' });

      await d.say(
        'A laboratory holds medical records, so DiagnoCare treats signing in as two steps rather than one.',
        'लैब में मेडिकल रिकॉर्ड रहते हैं, इसलिए DiagnoCare में लॉगिन एक नहीं, दो चरणों में होता है।');

      // formControlName is the stable hook: the styled <label> is not associated with
      // the input, so getByLabel does not resolve.
      await d.type(page.locator('input[formControlName="userId"]'), 'demo.admin');
      await d.say(
        'We start with the account user name.',
        'सबसे पहले अकाउंट का यूज़र नेम।');

      await d.type(page.locator('input[formControlName="password"]'), 'Demo@12345');
      await d.say(
        'Then the password. The app deliberately keeps the browser out of this field — nothing ever offers to save these credentials.',
        'फिर पासवर्ड। ऐप जान-बूझकर ब्राउज़र को इस फ़ील्ड से दूर रखता है — यहाँ पासवर्ड सेव करने का सुझाव कभी नहीं आता।');

      // The label is honest: this step requests the second factor, it does not sign in.
      await d.click(page.getByRole('button', { name: 'Generate OTP' }).first(), { settle: 2600 });
      await d.say(
        'The button says it plainly: this step does not sign us in, it asks the server which second factor the account uses and sends a one-time code to it.',
        'बटन खुद बता रहा है: यह कदम लॉगिन नहीं करता, यह सर्वर से पूछता है कि इस अकाउंट का दूसरा फैक्टर क्या है और वहाँ OTP भेज देता है।');

      const boxes = page.locator('input.otp-box');
      await boxes.first().waitFor({ state: 'visible', timeout: 20000 });
      await d.say(
        'The code goes here. This account is set up for email, but the same dialog handles an authenticator app or a fingerprint.',
        'कोड यहाँ डालना है। यह अकाउंट ईमेल पर सेट है, पर यही डायलॉग ऑथेंटिकेटर ऐप और फ़िंगरप्रिंट भी संभालता है।');

      const code = '482913';
      const { x, y } = await d.centerOf(boxes.first());
      await d.moveTo(x, y);
      await page.evaluate(([cx, cy]) => window.__tutorialClickPulse?.(cx, cy), [x, y]).catch(() => {});
      for (let i = 0; i < code.length; i++) {
        await boxes.nth(i).click();
        await boxes.nth(i).type(code[i], { delay: 60 });
        await d.wait(170);
      }

      // The dialog submits itself once the sixth digit lands, so Verify is only pressed
      // here if the form is somehow still waiting.
      const verify = page.getByRole('button', { name: 'Verify Code' });
      if (await verify.count() && await verify.first().isVisible().catch(() => false)) {
        await d.click(verify.first(), { settle: 1200 });
      }
      await page.waitForURL(/\/(patients|pathology)/, { timeout: 30000 }).catch(() => {});
      await d.wait(2000);
      await d.say(
        'With both factors accepted we are in, and the app opens on the laboratory home.',
        'दोनों फैक्टर पास होते ही हम अंदर हैं, और ऐप लैब के होम पेज पर खुल जाता है।');
    },
  },

  // ── 3. Navigation and the patient list ────────────────────────────────────
  {
    id: 'patients',
    title: 'Navigation and the patient list',
    titleHi: 'नेविगेशन और पेशेंट लिस्ट',
    meta: {
      onScreen: 'Top navigation, then the Patient Management System.',
      clicks: 'Lab Operations → Patient Details, status filter, Search.',
      highlight: 'Urgent patients pinned to the top; the filter bar.',
      expect: 'Urgent rows sit above normal ones; filtering narrows the list in place.',
      seconds: 108,
    },
    async run(d, page) {
      await d.titleCard({
        kicker: 'Chapter 2', title: 'Navigation and the patient list',
        titleHi: 'नेविगेशन और पेशेंट लिस्ट',
        subtitle: 'Where the front desk works',
        subtitleHi: 'जहाँ रिसेप्शन का पूरा दिन बीतता है',
      });

      await d.say(
        'Everything in DiagnoCare hangs off the bar across the top, grouped by the job you are doing rather than by the screen you want.',
        'DiagnoCare में सब कुछ ऊपर की इस बार से चलता है, और यह काम के हिसाब से बँटी है, स्क्रीन के हिसाब से नहीं।');

      await d.focusOn(page.locator('.dc-nav').first());
      await d.say(
        'Lab Operations is the day-to-day work. Reports is the accounting view. User Panel is your own attendance, and Admin Panel is staff, setup and licensing.',
        'Lab Operations रोज़ का काम है। Reports हिसाब-किताब है। User Panel आपकी अपनी हाज़िरी है, और Admin Panel में स्टाफ़, सेटअप और लाइसेंस आते हैं।');
      await d.clearFocus();

      await d.say(
        'The patient list lives under Lab Operations, as Patient Details.',
        'पेशेंट लिस्ट Lab Operations के अंदर Patient Details में मिलती है।');
      // Dropdown items carry author-written ids from labOperationMenu in constants.ts.
      await d.navigate('Lab Operations', 'patientDetails');
      await page.locator('table.patients-table').waitFor({ state: 'visible', timeout: 25000 });
      await d.wait(900);

      await d.say(
        'This is the Patient Management System — every patient registered at this lab.',
        'यह है Patient Management System — इस लैब में रजिस्टर हुआ हर मरीज़।');

      await d.focusOn(page.locator('table.patients-table thead'));
      await d.say(
        'Each row carries the registration date, the patient identifier, name and age, whether the report is urgent, and where the tests have got to.',
        'हर पंक्ति में रजिस्ट्रेशन की तारीख़, पेशेंट ID, नाम और उम्र, रिपोर्ट अर्जेंट है या नहीं, और टेस्ट कहाँ तक पहुँचे — सब दिखता है।');
      await d.clearFocus();

      await d.focusOn(page.locator('table.patients-table tbody tr').first());
      await d.say(
        'The ordering is not purely by date. Patients marked urgent are pinned to the top, because an urgent report is the one thing in this list that cannot wait its turn.',
        'क्रम सिर्फ़ तारीख़ से नहीं है। अर्जेंट मरीज़ हमेशा सबसे ऊपर रहते हैं, क्योंकि इस लिस्ट में अर्जेंट रिपोर्ट ही वह चीज़ है जो अपनी बारी का इंतज़ार नहीं कर सकती।');
      await d.clearFocus();

      await d.focusOn(page.locator('th', { hasText: 'Urg Rep' }).first());
      await d.say(
        'This column is why. Within the urgent rows, and within the normal ones, whatever order you chose by sorting still applies.',
        'वजह यही कॉलम है। अर्जेंट वालों के अंदर और सामान्य वालों के अंदर, आपने सॉर्ट से जो क्रम चुना है वही लागू रहता है।');
      await d.clearFocus();

      await d.focusOn(page.locator('.search-section'));
      await d.say(
        'Above the table is the filter bar, and this is where most of the day actually happens.',
        'टेबल के ऊपर फ़िल्टर बार है, और सच कहें तो दिन का ज़्यादातर काम यहीं होता है।');
      await d.clearFocus();

      // Two selects exist (status and page size); pick the one that owns the option.
      const statusFilter = page.locator('select').filter({ has: page.locator('option[value="Completed"]') }).first();
      await d.select(statusFilter, 'Completed', { settle: 2400 });
      await d.say(
        'Switching the status filter to Completed narrows the list to patients whose results are already signed off — the ones a receptionist is handing reports to.',
        'स्टेटस फ़िल्टर Completed करते ही लिस्ट में सिर्फ़ वे मरीज़ बचते हैं जिनके रिज़ल्ट साइन हो चुके हैं — यानी जिन्हें रिपोर्ट देनी है।');

      await d.type(page.getByPlaceholder(/name or id/i), 'David', { settle: 700 });
      await d.click(page.getByRole('button', { name: 'Search' }).first(), { settle: 2600 });
      await d.say(
        'Search works on a name or an identifier, and it runs on the server, so it searches every patient rather than only the page on screen.',
        'सर्च नाम या ID दोनों से चलता है, और यह सर्वर पर चलता है — यानी सिर्फ़ दिख रहे पेज में नहीं, पूरे डेटा में खोजता है।');
    },
  },

  // ── 4. Register a patient ─────────────────────────────────────────────────
  {
    id: 'register',
    title: 'Registering a patient',
    titleHi: 'नया मरीज़ रजिस्टर करना',
    meta: {
      onScreen: 'The four-step registration wizard: Basic Info, then Personal Details.',
      clicks: 'Add New Patient, Next, Patient Name, salutation, age, sex, relative, mobile.',
      highlight: 'System-issued identifiers; the name field capitalising itself as you type.',
      expect: 'A lower-case name is stored capitalised; step 2 is filled and valid.',
      seconds: 120,
    },
    async run(d, page) {
      await d.titleCard({
        kicker: 'Chapter 3', title: 'Registering a patient',
        titleHi: 'नया मरीज़ रजिस्टर करना',
        subtitle: 'The front desk workflow',
        subtitleHi: 'रिसेप्शन का रोज़ का काम',
      });

      await d.navigate('Lab Operations', 'patientDetails');
      await page.locator('table.patients-table').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
      await d.wait(900);

      await d.say(
        'A new patient starts here, with Add New Patient.',
        'नया मरीज़ यहीं से शुरू होता है — Add New Patient से।');
      await d.click(page.locator('.header-actions').getByRole('button', { name: 'Add New Patient' }), { settle: 2800 });
      await page.locator('input[formControlName="patient_Id"]').waitFor({ state: 'visible', timeout: 25000 });
      await d.wait(900);

      await d.say(
        'Registration is a wizard in four steps — identifiers, then the patient\'s details, then the tests they need, then payment.',
        'रजिस्ट्रेशन चार चरणों में होता है — पहचान संख्या, फिर मरीज़ की जानकारी, फिर ज़रूरी टेस्ट, और आख़िर में भुगतान।');

      await d.focusOn(page.locator('input[formControlName="patient_Id"]'));
      await d.say(
        'The first step is entirely system-generated. The serial number and patient identifier are issued here and cannot be typed over, so two desks can never mint the same identifier.',
        'पहला चरण पूरी तरह सिस्टम बनाता है। सीरियल नंबर और पेशेंट ID यहीं जारी होते हैं और इन्हें बदला नहीं जा सकता, ताकि दो काउंटर कभी एक ही ID न बना दें।');
      await d.clearFocus();

      await d.click(page.locator('.dc-btn--save').first(), { settle: 2200 });
      await page.locator('input[formControlName="patient_Name"]').waitFor({ state: 'visible', timeout: 20000 });
      await d.wait(700);
      await d.say(
        'Step two is the patient themselves.',
        'दूसरा चरण ख़ुद मरीज़ की जानकारी है।');

      // Typed in lower case on purpose — the field capitalises itself, which is the point.
      await d.type(page.locator('input[formControlName="patient_Name"]'), 'anita raghunathan', { settle: 1100 });
      await d.focusOn(page.locator('input[formControlName="patient_Name"]'));
      await d.say(
        'That name was typed entirely in lower case, and the field capitalised the first letter as it went. The rest is left exactly as entered, because a lab has to record a name the way the patient spells it.',
        'यह नाम पूरा छोटे अक्षरों में टाइप हुआ था, और फ़ील्ड ने पहला अक्षर अपने आप बड़ा कर दिया। बाक़ी नाम वैसा ही रहता है, क्योंकि लैब को नाम उसी तरह लिखना होता है जैसे मरीज़ लिखता है।');
      await d.clearFocus();

      await d.select(page.locator('select[formControlName="patient_Salutation"]'), 'Miss.', { settle: 800 });
      await d.say(
        'A salutation sits in front of the name and travels with it onto the printed report.',
        'नाम के आगे लगने वाला संबोधन छपी हुई रिपोर्ट पर भी साथ जाता है।');

      await d.type(page.locator('input[formControlName="patient_Age_Years"]'), '29', { settle: 800 });
      await d.say(
        'Age is captured in years, months and days rather than as a single number — which matters for infants, where a result has to be read against a range that changes week by week.',
        'उम्र साल, महीने और दिन — तीनों में ली जाती है, सिर्फ़ एक संख्या में नहीं। शिशुओं में यह ज़रूरी है, जहाँ सामान्य रेंज हर हफ़्ते बदलती है।');

      // The radio is visually hidden behind a styled pill label, and [value] is a property
      // binding, so an attribute selector on it would not match either. Click the label.
      await d.click(page.locator('label.radio-pill').filter({ hasText: /^Female$/ }), { settle: 800 });
      await d.say(
        'Sex is recorded here because most reference ranges depend on it.',
        'लिंग यहाँ दर्ज होता है क्योंकि ज़्यादातर नॉर्मल रेंज इसी पर निर्भर करती हैं।');

      await d.type(page.locator('input[formControlName="relative_Name"]'), 'Ramesh Raghunathan', { settle: 700 });
      await d.type(page.locator('input[formControlName="patient_Contact"]'), '9876501234', { settle: 900 });
      await d.say(
        'A relative and a mobile number give the lab someone to reach when a sample has to be repeated — and the number is what report links and reminders are sent to.',
        'रिश्तेदार का नाम और मोबाइल नंबर इसलिए लिए जाते हैं कि सैंपल दोबारा लेना पड़े तो किसी से संपर्क हो सके — और रिपोर्ट का लिंक और रिमाइंडर इसी नंबर पर जाते हैं।');

      await d.focusOn(page.locator('input[formControlName="patient_Contact"]'));
      await d.say(
        'From here the remaining two steps book the tests and take the payment, so one pass over one wizard finishes the whole front-desk job.',
        'आगे के दो चरणों में टेस्ट बुक होते हैं और भुगतान लिया जाता है — यानी एक ही फ़ॉर्म में रिसेप्शन का पूरा काम निपट जाता है।');
      await d.clearFocus();
    },
  },

  // ── 5. Master Test List ───────────────────────────────────────────────────
  {
    id: 'catalogue',
    title: 'The Master Test List',
    titleHi: 'मास्टर टेस्ट लिस्ट',
    meta: {
      onScreen: 'Three-column Groups / SubGroups / Tests browser, then the Add dialog.',
      clicks: 'A group, a subgroup, Add, New Group, Next, Group Name, Rate, Create Group.',
      highlight: 'The Group → SubGroup → Test hierarchy; the list refreshing after Create.',
      expect: 'The new group appears in the Groups column with no page reload.',
      seconds: 138,
    },
    async run(d, page) {
      await d.titleCard({
        kicker: 'Chapter 4', title: 'The Master Test List',
        titleHi: 'मास्टर टेस्ट लिस्ट',
        subtitle: 'The catalogue the rest of the application is built on',
        subtitleHi: 'वह कैटलॉग जिस पर बाक़ी पूरा ऐप्लिकेशन खड़ा है',
      });

      await d.navigate('Lab Operations', 'pathTest');
      await page.locator('.master-list-wrap').waitFor({ state: 'visible', timeout: 25000 });
      await d.wait(1300);

      await d.say(
        'This is the Master Test List, and it is worth understanding before anything else, because every booking, every rate and most reports are expressed in terms of it.',
        'यह है Master Test List। इसे सबसे पहले समझना चाहिए, क्योंकि हर बुकिंग, हर रेट और ज़्यादातर रिपोर्ट इसी के हिसाब से बनती हैं।');

      await d.focusOn(page.locator('.columns'));
      await d.say(
        'The catalogue is three levels deep. A Group is a department — Haematology, Biochemistry. A SubGroup is a panel the lab sells as one thing, like a Complete Blood Count. A Test is a single measurable value inside that panel.',
        'कैटलॉग तीन स्तरों का है। Group यानी विभाग — जैसे Haematology या Biochemistry। SubGroup वह पैनल है जो लैब एक साथ बेचती है, जैसे Complete Blood Count। और Test उस पैनल के अंदर एक नापी जाने वाली चीज़।');
      await d.clearFocus();

      await d.click(page.locator('.list-item').filter({ hasText: 'Biochemistry' }).first(), { settle: 2200 });
      await d.say(
        'Selecting Biochemistry loads the panels that belong to it, and nothing else — each column is fetched for the selection beside it.',
        'Biochemistry चुनते ही सिर्फ़ उसी के पैनल आते हैं — हर कॉलम अपने बग़ल वाले चुनाव के हिसाब से लोड होता है।');

      await d.click(page.locator('.list-item').filter({ hasText: 'Liver Function Test' }).first(), { settle: 2200 });
      await d.say(
        'And a panel opens the individual tests inside it, each with its own rate.',
        'और पैनल खोलने पर उसके अंदर के अलग-अलग टेस्ट दिखते हैं, हर एक का अपना रेट।');

      await d.focusOn(page.locator('.card.column').nth(2));
      await d.say(
        'Each test also carries the technique the lab performs it by. That matters more than it looks: the same analyte measured two different ways is not always comparable, and a clinician reading the report needs to know which was used.',
        'हर टेस्ट के साथ वह तकनीक भी दर्ज रहती है जिससे लैब उसे करती है। यह जितना दिखता है उससे ज़्यादा अहम है — एक ही चीज़ दो अलग तरीक़ों से नापी जाए तो नतीजे हमेशा तुलना-योग्य नहीं होते, और रिपोर्ट पढ़ने वाले डॉक्टर को पता होना चाहिए कि कौन सा तरीक़ा इस्तेमाल हुआ।');
      await d.clearFocus();

      await d.say(
        'Now let us add to the catalogue. One dialog handles all three levels — it can create a group on its own, or a group with a panel and a test underneath it in a single pass.',
        'अब कैटलॉग में कुछ जोड़ते हैं। एक ही डायलॉग तीनों स्तर संभालता है — अकेला Group भी बना सकते हैं, या एक ही बार में Group, उसका पैनल और उसके नीचे टेस्ट भी।');
      await d.click(page.locator('.action-bar').getByRole('button', { name: 'Add' }), { settle: 2200 });

      const modal = page.locator('app-add-edit-modal');
      // The host element has no box of its own and so is never "visible"; wait on content.
      await modal.getByText('Add New Item').waitFor({ state: 'visible', timeout: 15000 });
      await d.say(
        'We are creating a new department, so we choose New Group.',
        'हमें नया विभाग बनाना है, इसलिए New Group चुनते हैं।');
      await d.click(modal.getByText('New Group', { exact: true }), { settle: 1300 });
      await d.click(modal.getByRole('button', { name: 'Next' }), { settle: 1800 });

      await d.focusOn(modal.locator('input.code-input').first());
      await d.say(
        'The group code is generated and locked, exactly as the patient identifier was.',
        'ग्रुप कोड अपने आप बनता है और बदला नहीं जा सकता — ठीक वैसे ही जैसे पेशेंट ID।');
      await d.clearFocus();

      await d.type(modal.getByPlaceholder('e.g., HAEMATOLOGY'), 'Microbiology', { settle: 800 });
      await d.type(modal.getByPlaceholder('0.00'), '500', { settle: 900 });
      await d.say(
        'A name, and a rate for the group as a whole. Only now does the dialog let us commit — until both are valid, both buttons stay disabled.',
        'एक नाम, और पूरे ग्रुप का रेट। तभी डायलॉग आगे बढ़ने देता है — जब तक दोनों सही न हों, दोनों बटन बंद रहते हैं।');

      await d.say(
        'Watch the Groups column on the left as this saves.',
        'सेव होते समय बाईं ओर के Groups कॉलम पर ध्यान दीजिए।');
      await d.click(modal.getByRole('button', { name: 'Create Group' }), { settle: 3600 });
      await d.wait(1400);

      const added = page.locator('.list-item').filter({ hasText: 'Microbiology' }).first();
      await added.waitFor({ state: 'visible', timeout: 15000 });
      await d.focusOn(added);
      await d.say(
        'There it is. The moment the save succeeded the Master Test List re-read itself from the server, so the new group is simply present and selected — no page refresh, and what you are looking at is what the backend actually holds.',
        'यह रहा। सेव होते ही Master Test List ने सर्वर से डेटा दोबारा पढ़ लिया, इसलिए नया ग्रुप तुरंत मौजूद है और चुना हुआ भी — न पेज रिफ़्रेश करना पड़ा, और जो दिख रहा है वही सर्वर में असल में है।');
      await d.clearFocus();
    },
  },

  // ── 6. Reports ────────────────────────────────────────────────────────────
  {
    id: 'reports',
    title: 'Reports',
    titleHi: 'रिपोर्ट्स',
    meta: {
      onScreen: 'Reports menu, then the Patient Register report.',
      clicks: 'Reports → Patient Register.',
      highlight: 'That these reports are operational and financial, not clinical results.',
      expect: 'A report renders with the demo data behind it.',
      seconds: 58,
    },
    async run(d, page) {
      await d.titleCard({
        kicker: 'Chapter 5', title: 'Reports', titleHi: 'रिपोर्ट्स',
        subtitle: 'How the lab reads its own day',
        subtitleHi: 'लैब अपना दिन कैसे पढ़ती है',
      });

      await page.goto(`${APP}/reports/patient-register`, { waitUntil: 'domcontentloaded' });
      await d.wait(2600);

      await d.say(
        'Alongside the clinical work, DiagnoCare reports on the business of running the lab.',
        'क्लिनिकल काम के साथ-साथ DiagnoCare लैब चलाने के कारोबारी पक्ष की रिपोर्ट भी देता है।');
      await d.say(
        'The Patient Register is the day book — who was registered, what they were charged, what was collected. Beside it sit referrer and doctor-wise collection, discount authority, and the master rate list.',
        'Patient Register रोज़नामचा है — किसका रजिस्ट्रेशन हुआ, कितना चार्ज लगा, कितना वसूल हुआ। इसी के साथ रेफ़रर और डॉक्टर-वार कलेक्शन, डिस्काउंट अथॉरिटी, और मास्टर रेट लिस्ट भी हैं।');
      await d.say(
        'Each one takes a date range and a set of filters, and each can be read on screen or exported.',
        'हर रिपोर्ट में तारीख़ की सीमा और फ़िल्टर लगते हैं, और हर एक स्क्रीन पर देखी या एक्सपोर्ट की जा सकती है।');
    },
  },

  // ── 7. Account settings ───────────────────────────────────────────────────
  {
    id: 'account',
    title: 'Account settings',
    titleHi: 'अकाउंट सेटिंग्स',
    meta: {
      onScreen: 'Profile page, then the Change Password form.',
      clicks: 'Navigates to Profile, then Change Password; fills both password fields.',
      highlight: 'Server-side verification of the current password; the strength rule.',
      expect: 'Submit enables only once both entries are valid and match.',
      seconds: 56,
    },
    async run(d, page) {
      await d.titleCard({ kicker: 'Chapter 6', title: 'Your account', titleHi: 'आपका अकाउंट' });

      await page.goto(`${APP}/profile`, { waitUntil: 'domcontentloaded' });
      await d.wait(2400);
      await d.say(
        'Each user has their own profile — the contact details the one-time codes are sent to, and the photo that identifies them on shared terminals.',
        'हर यूज़र का अपना प्रोफ़ाइल होता है — वही संपर्क जानकारी जहाँ OTP जाता है, और वह फ़ोटो जिससे साझा कंप्यूटर पर पहचान होती है।');

      await page.goto(`${APP}/change-password`, { waitUntil: 'domcontentloaded' });
      await d.wait(2400);
      await d.say(
        'Changing a password asks for the current one, and that is checked by the server rather than in the browser, so this page can never be used to test whether a guess is right.',
        'पासवर्ड बदलने के लिए मौजूदा पासवर्ड माँगा जाता है, और उसकी जाँच ब्राउज़र में नहीं, सर्वर पर होती है — ताकि इस पेज से कोई अंदाज़ा लगाकर पासवर्ड न टटोल सके।');

      const newPw = page.locator('#newPassword');
      if (await newPw.count()) {
        await d.type(newPw, 'Lab@Secure2026', { settle: 700 });
        await d.type(page.locator('#confirmPassword'), 'Lab@Secure2026', { settle: 1100 });
        await d.say(
          'The new password has to clear the lab\'s strength rule, and the two entries have to agree, before the button will let you submit at all.',
          'नया पासवर्ड लैब के मज़बूती के नियम पर खरा उतरना चाहिए, और दोनों जगह एक जैसा होना चाहिए — तभी बटन सबमिट करने देता है।');
      }
    },
  },

  // ── 8. Conclusion ─────────────────────────────────────────────────────────
  {
    id: 'outro',
    title: 'Summary',
    titleHi: 'सारांश',
    meta: {
      onScreen: 'Closing title card.',
      clicks: 'None.',
      highlight: 'Recap of the path through the product.',
      expect: 'Viewer knows where to start and what to set up first.',
      seconds: 40,
    },
    async run(d) {
      await d.titleCard({
        kicker: 'Summary',
        title: 'That is DiagnoCare',
        titleHi: 'यही है DiagnoCare',
        subtitle: 'Catalogue → registration → collection → results → verified report',
        subtitleHi: 'कैटलॉग → रजिस्ट्रेशन → सैंपल → रिज़ल्ट → वेरिफ़ाई रिपोर्ट',
        narration: [
          ['That is the shape of the product: a test catalogue the lab defines once, patients registered against it, samples tracked, results entered and signed off, and reports that account for the day.',
           'ऐप्लिकेशन का ढाँचा यही है — एक टेस्ट कैटलॉग जो लैब एक बार बनाती है, उसी के आधार पर मरीज़ों का रजिस्ट्रेशन, सैंपल की ट्रैकिंग, रिज़ल्ट की एंट्री और साइन-ऑफ़, और दिन भर का हिसाब देती रिपोर्ट्स।'],
          ['If you are setting up a new lab, build the Master Test List first — everything else refers to it.',
           'अगर आप नई लैब शुरू कर रहे हैं, तो सबसे पहले Master Test List बनाइए — बाक़ी सब कुछ उसी को देखता है।'],
          ['Thanks for watching.',
           'देखने के लिए धन्यवाद।'],
        ],
        hold: 1800,
      });
    },
  },
];

module.exports = { sections, APP };
