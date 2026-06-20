# 11 — Agent Dental CRM Reuse Prompt

Use this addendum prompt before the next coding phase.

```txt
Important update:

Do not treat the restaurant platform as a greenfield rewrite. We already built many relevant patterns in the Dental CRM project, and suitable parts should be reused/adapted.

Before implementing the next phase, inspect the Dental CRM codebase if available locally, especially:

E:\Ek Gelir\Siteler\DisKlinikCRM-git

Search for:
- authorize
- getAccessibleClinicIds
- validateAndGetClinicIdScope
- MessageTemplate
- WhatsApp
- Meta WhatsApp
- Evolution
- sendTemplateMessage
- ContactRequest
- AppointmentRequest
- WhatsAppConversation
- conversation state
- webhook
- dataRetention
- PlatformSetting

Use this mapping:
- Clinic -> Restaurant
- clinicId -> restaurantId
- Patient -> Customer
- Appointment -> Reservation
- AppointmentRequest -> ReservationRequest
- ContactRequest -> Conversation / ContactRequest / StaffHandoff
- WhatsAppConversationMessage -> Message
- WhatsAppConversationState -> Conversation.stateJson
- MessageTemplate -> MessageTemplate

Reuse/adapt suitable Dental CRM patterns for:
- Express/Prisma backend structure;
- tenant scoping and authorization;
- role-gated frontend navigation/polling;
- integration settings screens;
- WhatsApp provider abstraction;
- Meta Cloud vs Evolution separation;
- webhook verification;
- conversation state handling;
- message template handling;
- outbound message logs;
- data retention/runtime toggle later.

Do not copy unrelated dental-specific modules such as treatment cases, dental chart, insurance, procedures, medical records, or stock logic.

Before writing code for each phase, include a short "Dental CRM reuse check" in your report:
- what you searched;
- what you reused/adapted;
- what you intentionally did not reuse;
- any differences needed for restaurant domain.

If you cannot access Dental CRM code, say that clearly and use the documented patterns instead.
```
