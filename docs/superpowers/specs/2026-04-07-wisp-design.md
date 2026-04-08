# Wisp Design Specification

The goal of Wisp is to provide seamless synchronization between the codebase and its documentation. This document outlines the high-level design and specifications of the Wisp system.

## Overview

Wisp is structured to monitor changes in the codebase and suggest necessary updates to documentation files. This helps ensure that documentation remains accurate and reflects the current state of the code.

## Diff Fetcher Component

The Diff Fetcher is responsible for retrieving the differences between the current state of the codebase and previous commits.

- **MAX_FILES Limitation:**
  - The system now supports a configurable maximum file limit for fetching diffs. This can be set via an environment variable `MAX_FILES`. If not set, it defaults to 50.

- **Environment Variables**:  
  - `MAX_FILES`: Limits the number of files to retrieve during a fetch operation. This allows flexibility according to deployment requirements.

## Pull Context

The Pull Context includes metadata for the pull request, including:

- `owner`: The username of the repository owner
- `repo`: The repository name
- `pull_number`: The pull request number
- `defaultBranch`: The default branch of the repository

## Additional Details

Further implementation specifics, architectural diagrams, and flowcharts will be developed in subsequent sections of this document, specifying precise class responsibilities and interactions.
