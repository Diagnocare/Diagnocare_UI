/**
 * Shape every environment file must satisfy.
 *
 * Angular swaps `environment.ts` for `environment.<config>.ts` via the
 * `fileReplacements` entries in angular.json, so a build only ever type-checks the
 * ONE file belonging to the configuration being built. Without a shared contract,
 * adding a property to `environment.ts` compiles locally and then fails the first
 * time some other configuration is built — which is exactly how the uat build broke
 * on `appName` / `envName`.
 *
 * Annotating each file with this interface moves that failure to authoring time:
 * add a field here and every environment file that lacks it stops compiling
 * immediately, in the editor, regardless of which configuration is active.
 */
export interface AppEnvironment {
  production: boolean;

  /** Base URL of the Diagnocare API, including trailing slash. */
  diagnocareApiURL: string;

  /** Base URL of the login UI for this environment, including trailing slash. */
  loginUIUrl: string;

  /** Base URL of the feedback / help portal, including trailing slash. */
  helpUrl: string;

  /** Product name sent to the feedback portal as ?product=. */
  appName: string;

  /** Environment slug sent to the feedback portal as ?env= (local | dev | qa | uat | prod). */
  envName: string;

  /** Basic-auth credentials used for the login / OTP endpoints. */
  basicAuth: {
    username: string;
    password: string;
  };
}
