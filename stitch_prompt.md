Create a complete, connected set of wireframes for WHISP, a privacy-first, pseudonymous messaging app for iOS and Android. Use the attached WHISP mobile architecture as the source of truth. Design the installed mobile app—not a web chat client or desktop dashboard.

GOAL
Show the key screens and end-to-end user journeys needed to understand and prototype the product. Prioritize clear navigation, understandable privacy controls, and realistic states over visual polish. Use a calm, minimal, trustworthy visual style with restrained color, readable typography, generous spacing, and accessible contrast. Use realistic but fictional sample names and content.

PLATFORM AND NAVIGATION
- Create mobile-sized screens and adapt platform conventions for iOS and Android while keeping the core experience consistent.
- Use a clear primary navigation for Chats, Contacts, Meetings, Vault, and Settings.
- Include screen titles, back navigation, primary and secondary actions, and consistent reusable components.
- Show important loading, empty, offline, error, pending, and success states—not only ideal paths.
- Connect the screens into clickable prototype flows where possible.

SCREENS AND FLOWS

1. FIRST RUN AND ACCOUNT
- Welcome screen that explains WHISP uses usernames and passkeys; do not ask for email, phone number, or an account password.
- Username entry with suggested alternatives, availability feedback, and a clear conflict state if a name is taken.
- Native passkey registration/login handoff states. Make clear that passkey authentication and encrypted-data recovery are separate.
- Explain device setup and recovery before users store important vault data. Include a recovery setup/reminder flow without implying WHISP can recover data if all authorized devices and recovery material are lost.
- Login, canceled passkey, expired challenge, and retry states.

2. CHATS AND CONTACTS
- Chats list with search, unread indicators, timestamps, and a useful empty state.
- Contacts list and contact profile/detail view with message, invite, and block actions.
- One-to-one chat showing encrypted-message presentation, delivery states, attachment entry point, and an offline/queued message state. Keep message content fictional.
- New-message flow for selecting an existing contact.
- Block confirmation and blocked-contact state.

3. FRIEND INVITATIONS
- Create a friend invitation and show its shareable link and separate secret code as distinct items.
- Provide copy/share actions and invitation expiry/revocation status.
- Recipient flow: open invitation link, authenticate or finish onboarding if needed, enter the separate code, review who invited them, then explicitly accept or decline.
- Include invalid, expired, revoked, already-used, and network-error states.
- Never make opening a link alone accept an invitation.

4. GROUPS
- Group list, group conversation, and group details/member list.
- Invite an existing contact with a separate code and explicit recipient acceptance.
- Show secure membership as pending while cryptographic group admission is being established; do not show the person as an active member prematurely.
- Include capacity, expired invitation, and failed/pending admission states.
- Show a clear membership-change notice and group encryption status.

5. MEETINGS AND CALLS
- Meetings list and create-meeting flow with expiry, participant limit, invitation policy, and optional host approval/lobby.
- Join flow using a meeting link plus separate code, followed by a waiting/lobby state when applicable.
- In-call screen with participant list, mute, camera, leave, and connection-quality controls.
- Show a meaningful error if end-to-end media encryption is unavailable; do not imply that transport encryption alone provides end-to-end encryption.
- Include reconnecting, meeting full, expired invite, host approval, and participant removed states.
- Do not add recording or transcription controls.

6. PERSONAL VAULT
- Vault unlock screen with local biometric/device authentication presentation and a separate reauthentication state.
- File list with folders or categories, search, encrypted file details, and upload progress.
- Add-file flow with explicit confirmation before export or sharing outside WHISP.
- Show a manifest/version conflict state with clear choices to review or resolve; never silently overwrite.
- Include offline access to already cached content, locked state, upload failure/retry, and unavailable-recovery-material messaging.

7. DEVICES, PRIVACY, AND SETTINGS
- Settings for privacy, invitations, notifications, app lock, recovery, and account/device management.
- Trusted-device list with link-device approval and device-revocation confirmation flows. Make clear that a new device is not automatically trusted for decrypting content.
- Generic notification preference screens; do not preview message plaintext in notification examples.
- Screen-protection information presented accurately: Android can restrict capture on supported surfaces; iOS cannot universally prevent screenshots. Show sensitive-content cover when the app backgrounds and a capture/mirroring response where supported.
- Include offline status and sync progress without suggesting that offline unlock is server authentication or that offline revocation is immediate.

CONTENT AND INTERACTION RULES
- Use plain-language labels and concise explanatory copy; avoid backend, database, API, or cryptographic implementation terminology.
- Present privacy protections honestly. Do not promise complete anonymity, universal screenshot prevention, remote erasure of content already received, or guaranteed background delivery.
- Keep invitation links and codes separate; do not expose codes in push notification examples.
- Keep security-critical actions explicit: accept invitations, approve devices, export files, revoke sessions/devices, and leave/remove a meeting participant.
- Make destructive actions confirmable and reversible only where appropriate.
- Use accessible touch targets, clear focus/selected states, and readable text.
- Keep the wireframes focused on user-facing mobile features. Do not create admin dashboards, backend architecture diagrams, or a browser-based chat interface.

DELIVERABLE
Generate an organized wireframe set grouped by the journeys above, with reusable components and linked prototype paths for:
A) create account → set up recovery → chats;
B) create and redeem a friend invitation → start a chat;
C) invite and admit a group member;
D) create and join a meeting;
E) unlock vault → upload/view a file → resolve a version conflict;
F) review and revoke a trusted device.