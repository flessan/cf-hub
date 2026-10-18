package id.imtaqin.cfmobile.quicktile

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class CfQuickTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    val state = getSharedPreferences(PREFS, MODE_PRIVATE)
    val ready = state.getBoolean(KEY_READY, false)
    val active = state.getBoolean(KEY_ACTIVE, false)

    tile.label = state.getString(KEY_LABEL, "CF-Hub") ?: "CF-Hub"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.subtitle = state.getString(KEY_SUBTITLE, "Open CF-Hub")
    }
    tile.state = if (ready && active) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    val state = getSharedPreferences(PREFS, MODE_PRIVATE)
    val ready = state.getBoolean(KEY_READY, false)
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.data = Uri.parse(
      if (ready) "cfmobile://shortcuts?toggle=under_attack" else "cfmobile://shortcuts"
    )
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    if (Build.VERSION.SDK_INT >= 34) {
      val pending = PendingIntent.getActivity(
        this, 42, launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launch)
    }
  }

  companion object {
    const val PREFS = "cf_quick_tile"
    const val KEY_LABEL = "label"
    const val KEY_SUBTITLE = "subtitle"
    const val KEY_ACTIVE = "active"
    const val KEY_READY = "ready"
  }
}
