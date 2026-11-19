# Deployment review — v1.1.0

Scope: self-hosted application only. No GitHub Pages site is deployed.
This is an implementation inventory, not certification of legal compliance.

| Requested check | Finding / remaining responsibility |
| --- | --- |
| Color contrast | Muted text and primary accent darkened. Custom video designs remain user-controlled; no blanket WCAG certification. |
| Image alternatives | Brand icon is decorative beside its text. Banner preview has an accessible name. |
| Refund policy | No sales, payments or subscriptions implemented; no refund transaction flow. Reassess if monetized. |
| Privacy policy | Existing usage/privacy notice describes processing. Public operators must add their own controller details, legal bases, hosting/log retention and rights/contact information. |
| Accessibility | Native labeled controls, keyboard focus, validation alerts and 16:9 preview provided. Full assistive-technology audit remains outstanding. |
| Fake reviews | No review or testimonial system found. |
| Terms | Existing rights acknowledgement does not grant media rights. Operator-specific terms require review before public deployment. |
| Third-party embeds | No third-party iframe embeds. Provider metadata/media are requested through the host; FFmpeg assets are proxied from unpkg on demand. |
| Image copyright | No song images or videos are bundled. Existing local icon retained. Media use still requires permissions; availability is not a license. |
| Cookies / consent | App sets no cookies. Appearance uses localStorage; temporary job ID uses sessionStorage. Operator-added analytics, proxies or embeds need separate assessment. |
| Tracking | No application analytics or advertising trackers found. Hosting logs and upstream requests remain possible. |
| Form consent | No contact/marketing forms. Existing media-rights acknowledgement remains required; it is not GDPR consent. |
| Clear labels | New duration, design, size and placement controls have explicit labels in English/German. |
| Business/operator details | No invented details. Private German operation is not automatically exempt from provider identification. |
| Data minimization | No accounts, newsletter or marketing collection. Validated JSON settings only; no uploaded executable designs. |
| Keyboard access | Standard selects, number fields, file chooser and buttons; visible focus retained. |
| Unsupported claims | No legal-compliance or media-licensing guarantee is made. Physical iPhone tests remain pending; banner preview is a placement preview. |

## German public hosting

For an offer that is not exclusively personal or familial, section 18(1) MStV
requires publicly accessible name and address. An openly available editing
tool is unlikely to fit the narrow personal/family exception. Section 5 DDG
can impose additional duties for qualifying commercial services. Free access
and private ownership alone do not settle the question. A GitHub handle is
not a substitute for required operator identification. Obtain case-specific
advice if withholding a public address is essential.

Sources reviewed 19 November 2026:

- https://www.ma-hsh.de/aufsicht/impressumspflicht.html
- https://www.gesetze-bayern.de/Content/Document/MStV-18
- https://www.gesetze-im-internet.de/ddg/__5.html
- https://www.jw.org/en/terms-of-use/

Keep the default localhost binding and authentication recommendations for
private self-hosting. Public deployment requires a separate operator review;
this release does not publish operator data or claim that the checklist alone
makes a public service lawful.
