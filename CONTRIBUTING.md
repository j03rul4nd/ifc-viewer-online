# Contributing

Thanks for your interest in IFC Viewer Online. This is a small, fast-moving project maintained by one person, so the process is deliberately light.

## Reporting bugs and ideas

- **Bugs:** open an issue with the *Bug report* template. A sample IFC file (or a link to one) helps more than anything else.
- **Ideas:** open an issue with the *Feature request* template. Please explain the problem before the solution.
- **Security issues:** do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Pull requests

1. Open an issue first for anything bigger than a small fix, so we agree on direction before you invest time.
2. Fork, branch from `main`, keep the change focused.
3. Run locally before pushing:
   ```bash
   npm install
   npm run lint
   npm test
   npm run build
   ```
4. Open the PR against `main` and fill in the template.

The maintainer may merge, rework or decline PRs to keep the product coherent. Not every good idea fits the roadmap.

## License

By contributing you agree that your contribution is licensed under the project's [LICENSE](LICENSE).
