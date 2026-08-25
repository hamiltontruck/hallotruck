import type { HalloLanguage } from "./LanguageProvider";

export const passwordRecoveryCopy: Record<HalloLanguage, {
  forgot: string;
  customerTitle: string;
  customerDescription: string;
  driverTitle: string;
  driverDescription: string;
  email: string;
  send: string;
  sent: string;
  backCustomer: string;
  backDriver: string;
  setTitle: string;
  setDescription: string;
  newPassword: string;
  confirmPassword: string;
  update: string;
  updating: string;
  updated: string;
  continueCustomer: string;
  continueDriver: string;
  continueAdmin: string;
  continueAccount: string;
  tooShort: string;
  mismatch: string;
}> = {
  en: {
    forgot: "Forgot password?",
    customerTitle: "Reset customer password",
    customerDescription: "Enter your customer email. We will send a secure password-reset link.",
    driverTitle: "Reset driver password",
    driverDescription: "Enter your driver email. We will send a secure password-reset link.",
    email: "Email address",
    send: "Send reset email",
    sent: "If an account exists for this email, a reset link has been sent. Open the newest email and tap Reset password.",
    backCustomer: "Back to customer login",
    backDriver: "Back to driver login",
    setTitle: "Set a new password",
    setDescription: "Create a new password of at least 10 characters for your HALLOTRUCK account.",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    update: "Update password",
    updating: "Updating password…",
    updated: "Password updated successfully. Sign in with your new password.",
    continueCustomer: "Continue to Customer login",
    continueDriver: "Continue to Driver login",
    continueAdmin: "Continue to Admin login",
    continueAccount: "Continue to portal selection",
    tooShort: "Password must contain at least 10 characters.",
    mismatch: "The two passwords do not match.",
  },
  om: {
    forgot: "Jecha iccitii dagatte?",
    customerTitle: "Jecha iccitii customer haaromsi",
    customerDescription: "Email customer galchi. Linkii jecha iccitii haaromsu nageenya qabu siif ergina.",
    driverTitle: "Jecha iccitii driver haaromsi",
    driverDescription: "Email driver galchi. Linkii jecha iccitii haaromsu nageenya qabu siif ergina.",
    email: "Teessoo email",
    send: "Email reset ergi",
    sent: "Account email kanaan yoo jiraate, linkiin reset ergameera. Email haaraa baniitii Reset password tuqi.",
    backCustomer: "Gara seensa customer deebi'i",
    backDriver: "Gara seensa driver deebi'i",
    setTitle: "Jecha iccitii haaraa kaa'i",
    setDescription: "Account HALLOTRUCK keetiif jecha iccitii haaraa qubee 10 ol qabu uumi.",
    newPassword: "Jecha iccitii haaraa",
    confirmPassword: "Jecha iccitii haaraa mirkaneessi",
    update: "Jecha iccitii haaromsi",
    updating: "Jecha iccitii haaromsaa jira…",
    updated: "Jechi iccitii milkaa'inaan haaromeera. Jecha iccitii haaraadhaan seeni.",
    continueCustomer: "Gara seensa Customer itti fufi",
    continueDriver: "Gara seensa Driver itti fufi",
    continueAdmin: "Gara seensa Admin itti fufi",
    continueAccount: "Gara filannoo portal itti fufi",
    tooShort: "Jechi iccitii yoo xiqqaate qubee 10 qabaachuu qaba.",
    mismatch: "Jechawwan iccitii lamaan wal hin siman.",
  },
  am: {
    forgot: "የይለፍ ቃል ረሱ?",
    customerTitle: "የደንበኛ የይለፍ ቃል ዳግም ያስጀምሩ",
    customerDescription: "የደንበኛ ኢሜይልዎን ያስገቡ። ደህንነቱ የተጠበቀ የይለፍ ቃል ማስጀመሪያ አገናኝ እንልካለን።",
    driverTitle: "የአሽከርካሪ የይለፍ ቃል ዳግም ያስጀምሩ",
    driverDescription: "የአሽከርካሪ ኢሜይልዎን ያስገቡ። ደህንነቱ የተጠበቀ የይለፍ ቃል ማስጀመሪያ አገናኝ እንልካለን።",
    email: "የኢሜይል አድራሻ",
    send: "የይለፍ ቃል ኢሜይል ላክ",
    sent: "በዚህ ኢሜይል መለያ ካለ የይለፍ ቃል አገናኝ ተልኳል። አዲሱን ኢሜይል ከፍተው Reset password ይጫኑ።",
    backCustomer: "ወደ ደንበኛ መግቢያ ተመለስ",
    backDriver: "ወደ አሽከርካሪ መግቢያ ተመለስ",
    setTitle: "አዲስ የይለፍ ቃል ያዘጋጁ",
    setDescription: "ለHALLOTRUCK መለያዎ ቢያንስ 10 ቁምፊ ያለው አዲስ የይለፍ ቃል ይፍጠሩ።",
    newPassword: "አዲስ የይለፍ ቃል",
    confirmPassword: "አዲስ የይለፍ ቃል ያረጋግጡ",
    update: "የይለፍ ቃል አዘምን",
    updating: "የይለፍ ቃል በማዘመን ላይ…",
    updated: "የይለፍ ቃሉ በተሳካ ሁኔታ ተዘምኗል። በአዲሱ የይለፍ ቃል ይግቡ።",
    continueCustomer: "ወደ ደንበኛ መግቢያ ቀጥል",
    continueDriver: "ወደ አሽከርካሪ መግቢያ ቀጥል",
    continueAdmin: "ወደ Admin መግቢያ ቀጥል",
    continueAccount: "ወደ ፖርታል ምርጫ ቀጥል",
    tooShort: "የይለፍ ቃሉ ቢያንስ 10 ቁምፊዎች ሊኖሩት ይገባል።",
    mismatch: "ሁለቱ የይለፍ ቃሎች አይዛመዱም።",
  },
};
