{lib}: let
  inherit (lib) types mkOption optionalAttrs;

  inherit (types) nullOr;

  pluginConfigType = types.submodule {
    options = {
      name = mkOption {
        type = types.str;
        description = "Plugin name, as listed in the plugin catalog.";
      };
      version = mkOption {
        type = nullOr types.str;
        default = null;
        description = ''
          Version to install and hold the plugin at. When unset, the newest
          version compatible with the server is installed and kept up to date.
        '';
      };
      configuration = mkOption {
        type = nullOr types.attrs;
        default = null;
        description = "Plugin configuration (arbitrary key-value pairs).";
      };
    };
  };

  pluginsConfigType = nullOr (types.listOf pluginConfigType);

  mkPluginsConfig = cfg:
    map (plugin:
      assert plugin.name != "" || throw "Plugin name cannot be empty";
        {}
        // {inherit (plugin) name;}
        // optionalAttrs (plugin ? version && plugin.version != null) {inherit (plugin) version;}
        // optionalAttrs (plugin.configuration != null) {inherit (plugin) configuration;})
    cfg;
in {
  inherit pluginsConfigType mkPluginsConfig;
}
