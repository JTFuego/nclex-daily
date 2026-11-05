# Connecting NCLEX Daily to Firebase

Firebase is Google's service that will handle sign-in and store everyone's progress. This takes about 20 minutes on a computer. It's free, and you won't need a credit card. Google changes its screens from time to time, so a button's wording may differ slightly.

**Stay on the free plan.** If Firebase ever offers an upgrade to the "Blaze" plan, decline it. On the free "Spark" plan, you can't be charged; if usage hits a limit, the app just pauses until the limit resets.

## 1. Create the project

A project is your app's private space in Firebase.

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name it `nclex-daily` and continue.
4. Turn **Google Analytics off**. The app doesn't need it, so this avoids collecting extra data.
5. Click **Create project**, wait, then click **Continue**.

## 2. Turn on Google sign-in

This is what lets people sign in with their Google accounts, with no passwords for you to manage.

1. In the left menu, open **Build** (or **Security**), then **Authentication**, and click **Get started**.
2. Open the **Sign-in method** tab and click **Google**.
3. Turn on **Enable**.
4. Set **Public-facing name** to `NCLEX Daily`. People see this when they sign in.
5. Choose your email as the **Project support email**.
6. Click **Save**.

## 3. Approve your website's address

Google only allows sign-in from addresses on this list.

1. Still in **Authentication**, open the **Settings** tab, then **Authorized domains**.
2. Click **Add domain**.
3. Enter your GitHub Pages address with no `https://` and nothing after the `.io`: `YOUR-USERNAME.github.io`
4. Click **Add**.
5. To test on your Mac too, make sure `localhost` is listed, and add it if not.

## 4. Create the database

Firestore is the database that holds each person's progress.

1. In the left menu, open **Build** (or **Databases**), then **Firestore Database**, and click **Create database**.
2. If asked for an edition, choose **Standard**.
3. For location, choose one near you, such as `nam5 (United States)`. **This can't be changed later.**
4. Choose **Start in production mode**, which blocks all access until the next step.
5. Click **Create**.

## 5. Publish the security rules

Rules are what stop anyone from seeing someone else's data.

1. In **Firestore Database**, open the **Rules** tab.
2. Delete everything in the editor.
3. Open `firestore.rules` from this project in a text editor (TextEdit works), copy all of it, and paste it into the editor.
4. Click **Publish**. If it shows an error, don't work around it; send the message to Claude.

## 6. Get your settings

1. Click the **gear icon** at the top left, then **Project settings**.
2. Under **Your apps**, click the **web icon**, which looks like `</>`.
3. Name the app `NCLEX Daily`. Leave **Firebase Hosting unchecked**, since you're using GitHub Pages.
4. Click **Register app**. You'll see code containing `firebaseConfig`.
5. Keep that page open for the next step.

## 7. Paste your settings into the app

1. Open `js/firebase-config.js` in this project.
2. Replace each `PASTE_...` value with the matching value from Firebase. Keep the quote marks:

   ```js
   export const firebaseConfig = {
     apiKey: 'your value',
     authDomain: 'your value',
     projectId: 'your value',
     appId: 'your value',
   };
   ```

3. Firebase also shows `storageBucket` and `messagingSenderId`. This app doesn't use them, so you can leave them out.
4. Save the file.

## 8. Upload to GitHub

1. Open your `nclex-daily` repository and click **Add file**, then **Upload files**.
2. In Finder, open the project folder, select everything inside it, and drag it onto the page.
3. Click **Commit changes**.
4. Wait a few minutes, then open `https://YOUR-USERNAME.github.io/nclex-daily/`. If it still shows the old version, refresh it.

## What's safe to make public

| Item | Safe in your public repository? |
| --- | --- |
| `apiKey`, `authDomain`, `projectId`, `appId` | **Yes.** They only identify your project. Your data is protected by sign-in and your security rules. |
| `storageBucket`, `messagingSenderId`, `measurementId` | **Yes**, though this app doesn't need them. |
| A **service account key**: a downloaded `.json` file containing `private_key` | **Never.** It bypasses all your security rules. |
| Admin SDK setup files, or any file described as a secret or token | **Never.** |

This setup never asks you to download a secret key, and the app doesn't use one. If you ever see **Generate new private key**, you're in the wrong place, so don't click it.

## Testing with a second account

Do this in order. You'll need a second Google account, or a classmate.

1. **Your first sign-in:** in Safari or Chrome, where you've used the app before, open your site and sign in. Accept the offer to import your progress, and check that your streak and history look right.
2. **Same progress on your phone:** open the site in **Safari** on your phone, sign in with the same account, and check that it matches. Answer a question on your phone, then look at your laptop's Today's Set tab. It should update within a few seconds.
3. **Offline:** on your phone, turn on Airplane Mode with the app open and answer a question. An offline notice should appear. Turn Airplane Mode off and check that the answer reaches your laptop.
4. **Second account:** in a private window, or on another person's device, sign in with the second account. It should start empty, show no import offer in the private window, and show none of your history. Answer a question, then confirm it doesn't appear in your account.
5. **Separation in the database:** in the Firebase console, open **Firestore Database**, then **Data**. Under `users`, you should see two separate user IDs.
6. **Security rules:** in the **Rules** tab, open **Rules Playground**. Set the path to `users/SOME-OTHER-ID/days/2026-01-01`, set the type to `get`, turn on **Authenticated**, and use a different ID as the signed-in user. Click **Run**, and it should say **denied**. Then use the same ID in both places, and it should say **allowed**.
7. **Delete my data:** with the second account, open **Progress**, then **Delete my data**. You should be signed out. In the Firebase console, that user's data and their entry under **Authentication**, **Users** should be gone. Your own data should be untouched.

## Good to know

- **iPhone Home Screen icon:** sign in using Safari itself first. A Home Screen icon keeps separate storage and may not support the sign-in window. If your icon has trouble, use the site in Safari.
- **Who can see what:** other users can't see your data. As the project owner, you can view all stored data in the Firebase console, including classmates' names, emails, and answers. Tell classmates this before they join; the app's footer says so too.
- **Offline limits:** the app handles dropped connections while it's open. Opening it from scratch with no connection won't work, because the page itself has to load from the internet.
