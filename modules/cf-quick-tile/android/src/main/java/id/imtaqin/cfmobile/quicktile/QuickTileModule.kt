package id.imtaqin.cfmobile.quicktile

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.service.quicksettings.TileService
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class QuickTileModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CfQuickTile")

    Function("setState") { label: String, subtitle: String?, active: Boolean, ready: Boolean ->
      val context = appContext.reactContext ?: return@Function
      context.getSharedPreferences(CfQuickTileService.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(CfQuickTileService.KEY_LABEL, label)
        .putString(CfQuickTileService.KEY_SUBTITLE, subtitle)
        .putBoolean(CfQuickTileService.KEY_ACTIVE, active)
        .putBoolean(CfQuickTileService.KEY_READY, ready)
        .apply()

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        TileService.requestListeningState(
          context,
          ComponentName(context, CfQuickTileService::class.java)
        )
      }
    }

    Function("setSecureScreen") { enabled: Boolean ->
      appContext.currentActivity?.runOnUiThread {
        val window = appContext.currentActivity?.window ?: return@runOnUiThread
        if (enabled) {
          window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
      }
    }
  }
}
