package com.glide.remote

import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.ImageButton
import android.widget.TextView
import com.journeyapps.barcodescanner.CaptureActivity
import com.journeyapps.barcodescanner.DecoratedBarcodeView

class ScannerActivity : CaptureActivity() {
 private lateinit var scanner:DecoratedBarcodeView; private var torch=false
 override fun initializeContent():DecoratedBarcodeView{setContentView(R.layout.activity_scanner);scanner=findViewById(R.id.zxing_barcode_scanner);findViewById<ImageButton>(R.id.close_scanner).setOnClickListener{finish()};findViewById<TextView>(R.id.torch).setOnClickListener{view->torch=!torch;if(torch)scanner.setTorchOn()else scanner.setTorchOff();(view as TextView).text=if(torch)"FLASH  ON" else "FLASH  OFF"};return scanner}
 override fun onCreate(state:Bundle?){super.onCreate(state);window.statusBarColor=android.graphics.Color.BLACK;window.navigationBarColor=android.graphics.Color.BLACK
  ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(R.id.scanner_controls)){view,insets->val safe=insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout());val p=(22*resources.displayMetrics.density).toInt();view.setPadding(p+safe.left,p+safe.top,p+safe.right,p+safe.bottom);insets}
 }
}
