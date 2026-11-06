export interface MethodDef {
  key:        string;               // internal key used for routing
  label:      string;               // display name
  icon:       string;               // fa icon class
  iconClass:  string;               // colour class on .otp-method-icon
  sub:        string;               // sub-label shown on card
  authType:   number;               // maps to backend AuthType enum
}
