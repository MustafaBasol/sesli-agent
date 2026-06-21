/**
 * Vapi-facing response copy. Ported verbatim from src/lib/vapi-messages.ts
 * (Next.js app) so callers hear the same wording from either backend.
 */
export const MESSAGES = {
  reservation_received: {
    fr: "Merci, votre demande de réservation a bien été transmise à l’équipe Golden Meat. L’équipe vous confirmera la disponibilité dès que possible.",
    tr: "Teşekkürler, rezervasyon talebiniz Golden Meat ekibine iletildi. Uygunluk kontrol edildikten sonra size dönüş yapılacak.",
    en: "Thank you, your reservation request has been sent to the Golden Meat team. They will confirm availability as soon as possible.",
  },
  staff_handoff: {
    fr: "Merci, votre demande a été transmise à l’équipe Golden Meat. Quelqu’un vous recontactera dès que possible.",
    tr: "Teşekkürler, talebiniz Golden Meat ekibine iletildi. En kısa sürede size dönüş yapılacak.",
    en: "Thank you, your request has been sent to the Golden Meat team. Someone will contact you as soon as possible.",
  },
  generic_error: {
    fr: "Je suis désolé, une erreur est survenue lors du traitement de votre demande. Veuillez réessayer plus tard.",
    tr: "Üzgünüm, talebiniz işlenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
    en: "I am sorry, an error occurred while processing your request. Please try again later.",
  },
};

export type VapiLanguage = "fr" | "tr" | "en";

export function getVapiResponse(type: keyof typeof MESSAGES, lang: string) {
  const messages = MESSAGES[type] || MESSAGES.generic_error;
  const safeLang = lang && messages[lang as VapiLanguage] ? (lang as VapiLanguage) : "en";

  return {
    status: "received",
    message: `${type.replace("_", " ")} successfully.`,
    customer_message_fr: messages.fr,
    customer_message_tr: messages.tr,
    customer_message_en: messages.en,
    text: messages[safeLang],
  };
}
