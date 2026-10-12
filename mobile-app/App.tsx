import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { mobileWebCss } from "./mobileWebCss";

const SITE_ORIGIN = "https://officebasedanesthesia.github.io";
// The app has its own stable GitHub Pages path, separate from the website.
const SITE_URL = `${SITE_ORIGIN}/office-based-emergency-manual/app/`;
const MOBILE_STYLE_INJECTION = `
  (function () {
    var style = document.getElementById("oba-mobile-app-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "oba-mobile-app-styles";
      document.head.appendChild(style);
    }
    style.textContent = ${JSON.stringify(mobileWebCss)};
    var viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }
    viewport.content = "width=device-width, initial-scale=1, maximum-scale=1";
  })();
  true;
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  function shouldLoad(request: WebViewNavigation) {
    if (request.url.startsWith(SITE_ORIGIN) || request.url === "about:blank") {
      return true;
    }

    Linking.openURL(request.url).catch(() => {});
    return false;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#eef7ff" />
      <View style={styles.container}>
        {canGoBack ? (
          <View style={styles.backBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to the emergency manual"
              style={styles.backButton}
              onPress={() => webViewRef.current?.goBack()}
            >
              <Text style={styles.backButtonText}>‹ Back to app</Text>
            </Pressable>
          </View>
        ) : null}

        <WebView
          ref={webViewRef}
          source={{ uri: SITE_URL }}
          originWhitelist={["https://*", "http://*"]}
          injectedJavaScriptBeforeContentLoaded={MOBILE_STYLE_INJECTION}
          injectedJavaScript={MOBILE_STYLE_INJECTION}
          onShouldStartLoadWithRequest={shouldLoad}
          onLoadStart={() => {
            setIsLoading(true);
            setLoadError(false);
          }}
          onLoadEnd={() => setIsLoading(false)}
          onLoad={() => webViewRef.current?.injectJavaScript(MOBILE_STYLE_INJECTION)}
          onNavigationStateChange={(navigationState) => {
            setCanGoBack(navigationState.canGoBack);
            webViewRef.current?.injectJavaScript(MOBILE_STYLE_INJECTION);
          }}
          onError={() => {
            setIsLoading(false);
            setLoadError(true);
          }}
          onHttpError={() => {
            setIsLoading(false);
            setLoadError(true);
          }}
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          pullToRefreshEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          style={styles.webView}
        />

        {isLoading ? (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#0f47a1" />
            <Text style={styles.loadingText}>Loading emergency manual…</Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.overlay}>
            <Text style={styles.errorTitle}>Manual unavailable</Text>
            <Text style={styles.errorBody}>
              Check your internet connection, then try loading the manual again.
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                setLoadError(false);
                setIsLoading(true);
                webViewRef.current?.reload();
              }}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#eef7ff"
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  webView: {
    flex: 1,
    backgroundColor: "#ffffff"
  },
  backBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#bfd0e4",
    backgroundColor: "#eef7ff"
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#0f47a1"
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
    backgroundColor: "#f7fbff"
  },
  loadingText: {
    color: "#415a77",
    fontSize: 16,
    fontWeight: "600"
  },
  errorTitle: {
    color: "#102b4e",
    fontSize: 24,
    fontWeight: "800"
  },
  errorBody: {
    maxWidth: 340,
    color: "#52657a",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center"
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: "#0f47a1"
  },
  retryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  }
});
