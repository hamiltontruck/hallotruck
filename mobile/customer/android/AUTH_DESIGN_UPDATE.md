# Customer Android auth UI

The login and create-account screens use the existing MainActivity, view binding and
CustomerViewModel. The official repo logo, compact locale selector, decorative truck hero,
blue actions and email/password icons implement the approved design in Kotlin/XML.
Signup retains the existing six-digit numeric PIN contract and confirmation.
Password visibility, inline status, duplicate-submit protection, locale recreation and back
navigation remain native. Password recovery explicitly hands off to the Customer Portal.
No support link is fabricated: a verified support contact has not been configured.

Local verification: all resource XML parses, original binding IDs retained, unique IDs,
new EN/OR/Amharic resources present, changes confined to Customer Android. Android build,
lint and unit tests run through the existing Customer Android GitHub Actions workflow.
Emulator visual QA and live authenticated flows still require verification.
