import { App } from "./app";
import { wakeBackend } from "./net/wakeBackend";

wakeBackend();
new App().start();
