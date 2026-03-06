package com.quick.authenticator

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    private var bridgeAttached = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
    }

    override fun onPostCreate(savedInstanceState: Bundle?) {
        super.onPostCreate(savedInstanceState)
        val content = findViewById<View>(android.R.id.content)
        // Initial color matching dark theme --bg2
        content.setBackgroundColor(Color.parseColor("#161b22"))

        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, systemBars.top, 0, systemBars.bottom)
            insets
        }

        // Wait for WebView to appear in the view hierarchy, then attach JS bridge
        content.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (bridgeAttached) {
                    content.viewTreeObserver.removeOnGlobalLayoutListener(this)
                    return
                }
                val webView = findWebView(window.decorView)
                if (webView != null) {
                    bridgeAttached = true
                    content.viewTreeObserver.removeOnGlobalLayoutListener(this)
                    webView.addJavascriptInterface(object {
                        @android.webkit.JavascriptInterface
                        fun setStatusBarColor(hex: String) {
                            runOnUiThread {
                                content.setBackgroundColor(Color.parseColor(hex))
                            }
                        }
                    }, "AndroidBridge")
                }
            }
        })
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val found = findWebView(view.getChildAt(i))
                if (found != null) return found
            }
        }
        return null
    }
}
