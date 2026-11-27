# Changelog

## 1.0.0 (2026-11-27)


### Features

* add analysis with suspects, charts and heatmap ([048393b](https://github.com/herrdommel/foodlog/commit/048393b2cae73564fd1258d31deadb35061c4cb1))
* add csv export and printable report behind the data_export flag ([dd249ea](https://github.com/herrdommel/foodlog/commit/dd249ea1b83a4b4493ce3592eb17490a4934a0ca))
* add ingredients page for custom tags and catalog ([76e49d8](https://github.com/herrdommel/foodlog/commit/76e49d8776b05d394446efb1838788951a4ccf94))
* add privacy consent ui, account deletion and export, legal pages and templates ([55784a1](https://github.com/herrdommel/foodlog/commit/55784a174d1397b0f00ef8405526dca52f0fe295))
* **ai:** include sleep and stress in the analysis payload ([45ae22e](https://github.com/herrdommel/foodlog/commit/45ae22e80bfb783d8156bcec6e9ee0bd9342bed5))
* **ai:** recognise ingredients from a photo ([267d73a](https://github.com/herrdommel/foodlog/commit/267d73a7b1a19c994526b7e4a0f3310855ca939a))
* **auth:** add two-factor sign-in with authenticator app and passkeys ([44c050e](https://github.com/herrdommel/foodlog/commit/44c050ebf18424278d2afb89f1f9aaf4ff280341))
* **backend:** add admin user management, invitations and settings ([24a4fdf](https://github.com/herrdommel/foodlog/commit/24a4fdfae24a6c785767c18f28ca18b433a57112))
* **backend:** add ai analysis with encrypted user api keys ([c32a4ba](https://github.com/herrdommel/foodlog/commit/c32a4baff719623d024143a12a0ae4e95948f4ae))
* **backend:** add authentication, profile and feature flag resolution ([64788d6](https://github.com/herrdommel/foodlog/commit/64788d6cc794b304c6640546e3288b3c7027821a))
* **backend:** add ingredient catalog, entries and templates ([6638194](https://github.com/herrdommel/foodlog/commit/663819418cdfb0c66f2d04eeea6b37bbf5f0c1d4))
* **backend:** add privacy consent, account deletion, data export, retention and legal documents ([75fe6a4](https://github.com/herrdommel/foodlog/commit/75fe6a4a0335f4e179e0f7ac6e9ab6db4a39b9da))
* **deploy:** add production compose, deploy and backup scripts, deploy workflow and operations guide ([91de32e](https://github.com/herrdommel/foodlog/commit/91de32e3e0643be33bf1388b06f1850d67c6255a))
* **frontend:** add a start page for guests ([40f2fd1](https://github.com/herrdommel/foodlog/commit/40f2fd13a6765935d3d0a92bfe10dd1d5320f93e))
* **frontend:** add admin area for users, invitations and settings ([70a6fa5](https://github.com/herrdommel/foodlog/commit/70a6fa509c4d40cf0baf9c2d08e1b26b221b8b7b))
* **frontend:** add ai analysis page with consent and data preview ([9c55f7d](https://github.com/herrdommel/foodlog/commit/9c55f7d9ffd19e37261e9dbb52f851ed8af969d8))
* **frontend:** add auth pages, profile and translations ([dbea1d0](https://github.com/herrdommel/foodlog/commit/dbea1d0831f68e282296651569c4e927d40e30be))
* **frontend:** add dashboard with entry tracking, ingredients and templates ([433498d](https://github.com/herrdommel/foodlog/commit/433498da842a0b5e557a3c2faf35acf02964ad5a))
* **frontend:** log sleep and stress and show the comparison ([f64ecc0](https://github.com/herrdommel/foodlog/commit/f64ecc0a6bff962e4601ef2856071d84bd9bb3d9))
* **frontend:** move profile, admin, ingredients and sign out into an account menu and widen the app ([05e8a70](https://github.com/herrdommel/foodlog/commit/05e8a7089c407aeb7430ffb2d221d9e64e61c484))
* **frontend:** open the sign-in form in a dialog on phones ([b47343b](https://github.com/herrdommel/foodlog/commit/b47343b6cd8b5e2dfb09863971276659f9bc648f))
* **frontend:** polish the phone layout and streamline the AI page ([2e64550](https://github.com/herrdommel/foodlog/commit/2e64550005e2f6f5f8a2fcdcdc49e3b69b867052))
* **frontend:** replace inline icons and native selects with an icon pack, flags and a custom select ([5ea5f08](https://github.com/herrdommel/foodlog/commit/5ea5f088ac3d2c9b7e502609faab52773e1df898))
* **products:** look up barcodes through open food facts ([60294f1](https://github.com/herrdommel/foodlog/commit/60294f11c2f34973e10871330c68f1525eb7b798))
* **products:** review and add scanned ingredients in the meal form ([6401394](https://github.com/herrdommel/foodlog/commit/640139478ebf2b3de1d18a5924bfd678a8325cd1))
* **products:** scan barcodes with the camera or from a photo ([6e8463f](https://github.com/herrdommel/foodlog/commit/6e8463fc17ff2a46625d7afce17f5268e8889380))
* ship license notices and check dependency licenses ([8d1bdd1](https://github.com/herrdommel/foodlog/commit/8d1bdd13c35bfc0079c447fb3d020498b9f9dd9d))
* **tracking:** add sleep and stress entries with a per-day analysis ([f39276f](https://github.com/herrdommel/foodlog/commit/f39276fd475fac49ca003eb336c5cd40f4387452))


### Bug Fixes

* **ai:** allow choosing a provider before storing its key ([587ae07](https://github.com/herrdommel/foodlog/commit/587ae0745bfe36cf065ee2d0309e41c65ed4e969))
* **auth:** throttle logins per address and harden email change ([4785b2e](https://github.com/herrdommel/foodlog/commit/4785b2edba4818fd451e886a6f6a06214dd56df1))
* **deploy:** replace X-Forwarded-For in nginx so rate limits cannot be spoofed ([4be87a9](https://github.com/herrdommel/foodlog/commit/4be87a9c422106fdc2dfc7f5bfd63b760e69760a))
* **frontend:** disable saving a meal while a suggestion is being added ([f524c1a](https://github.com/herrdommel/foodlog/commit/f524c1a97425e5bc769f993fb9ff5b9859fae926))
* **frontend:** improve text contrast and mobile header ([0d40759](https://github.com/herrdommel/foodlog/commit/0d4075931afc4d1d1583641ba2c783a99aafb13a))
* **frontend:** keep the day navigation stable and always show the today button ([87e97ca](https://github.com/herrdommel/foodlog/commit/87e97ca7cea388b95a03b4f4f8e26a30a97b68ab))
* **frontend:** offer one camera and one photo or file button and clear the unreadable photo message on manual entry ([192a705](https://github.com/herrdommel/foodlog/commit/192a7057c0c4430bebcabcb8795d64894b094c66))
* **frontend:** raise dark accent contrast on cards ([9aea8b8](https://github.com/herrdommel/foodlog/commit/9aea8b822efff484f2b96b6e3e41e7a0c1b3c7d1))
* **ingredients:** load the full catalog by paging while scrolling ([da04f28](https://github.com/herrdommel/foodlog/commit/da04f28040f8a1a7c22f727de3143ce9771f97ee))
* reference people by id in the admin activity log ([430c31f](https://github.com/herrdommel/foodlog/commit/430c31f244c6348c1d16cd984128c203245f874b))
* remove the unused npm from the backend image ([dd1b61b](https://github.com/herrdommel/foodlog/commit/dd1b61b106838a111e59f0e44842b46e6ae0b57f))
