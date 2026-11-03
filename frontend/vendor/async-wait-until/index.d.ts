export declare class TimeoutError extends Error {
    constructor(timeoutInMs?: number);
}
export declare const DEFAULT_INTERVAL_BETWEEN_ATTEMPTS_IN_MS = 50;
export declare const DEFAULT_TIMEOUT_IN_MS = 5000;
export declare const WAIT_FOREVER: number;
export type FalsyValue = null | undefined | false | '' | 0 | void;
export type TruthyValue = Record<string, unknown> | unknown[] | symbol | ((..._args: unknown[]) => unknown) | Exclude<number, 0> | Exclude<string, ''> | true;
export type PredicateReturnValue = TruthyValue | FalsyValue;
export type Predicate<T extends PredicateReturnValue> = () => T | Promise<T>;
export type Options = {
    timeout?: number;
    intervalBetweenAttempts?: number;
};
export declare const waitUntil: <T extends PredicateReturnValue>(predicate: Predicate<T>, options?: number | Options, intervalBetweenAttempts?: number) => Promise<T>;
export default waitUntil;
