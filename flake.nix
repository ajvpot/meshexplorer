{
  description = "meshexplorer dev shell (Node + dev deps)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";

  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          # Latest Node LTS (24). Avoids Node 25's experimental localStorage global that
          # breaks Next SSR (Node 24 has no localStorage global by default).
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 ];
            shellHook = ''
              echo "meshexplorer dev shell — node $(node -v), npm $(npm -v)"
            '';
          };
        });
    };
}
