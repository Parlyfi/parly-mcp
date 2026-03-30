# @parly/sdk

TypeScript SDK for Parly V16.9.9 private execution flows.

This canonical workspace package is the internal source package. The public npm surface is produced through the SDK export pipeline, which vendors internal support packages into a self-contained public `@parly/sdk` package.

This first pass is compile-first scaffolding. It establishes the SDK boundaries, typed launch context, and MPP-boundary shell without claiming full protocol execution completeness.
