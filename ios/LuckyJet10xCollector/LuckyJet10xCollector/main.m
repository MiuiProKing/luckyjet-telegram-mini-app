#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static NSString * const LJURLString = @"https://one-vv0199.com/casino/play/v_1wingames:luckyjet?p=yshe";

@interface LJCollectorViewController : UIViewController <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UITableViewDataSource>
@property (nonatomic, strong) WKWebView *webView;
@property (nonatomic, strong) UILabel *statusLabel;
@property (nonatomic, strong) UILabel *statsLabel;
@property (nonatomic, strong) UILabel *timerLabel;
@property (nonatomic, strong) UILabel *watchLabel;
@property (nonatomic, strong) UITableView *tableView;
@property (nonatomic, strong) UIButton *startButton;
@property (nonatomic, strong) UIButton *hideButton;
@property (nonatomic, strong) UIStackView *controlsStack;
@property (nonatomic, strong) NSLayoutConstraint *controlsHeightConstraint;
@property (nonatomic, strong) NSMutableArray<NSDictionary *> *events;
@property (nonatomic, strong) NSDateFormatter *isoFormatter;
@property (nonatomic, strong) NSDateFormatter *clockFormatter;
@property (nonatomic, strong) NSDate *sessionStartDate;
@property (nonatomic, strong) NSDate *lastEventDate;
@property (nonatomic, strong) NSDate *acceptAfterDate;
@property (nonatomic, strong) NSTimer *timer;
@property (nonatomic) double lastEventValue;
@property (nonatomic) BOOL collecting;
@property (nonatomic) BOOL controlsHidden;
@end

@implementation LJCollectorViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"LuckyJet 10x+ • 20";
    self.view.backgroundColor = UIColor.systemBackgroundColor;
    self.navigationController.navigationBar.prefersLargeTitles = NO;
    self.events = [NSMutableArray array];

    self.isoFormatter = [NSDateFormatter new];
    self.isoFormatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    self.isoFormatter.timeZone = [NSTimeZone timeZoneWithName:@"Europe/Kyiv"];
    self.isoFormatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSXXX";

    self.clockFormatter = [NSDateFormatter new];
    self.clockFormatter.locale = [NSLocale localeWithLocaleIdentifier:@"ru_RU"];
    self.clockFormatter.timeZone = [NSTimeZone timeZoneWithName:@"Europe/Kyiv"];
    self.clockFormatter.dateFormat = @"HH:mm:ss";

    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    WKUserContentController *uc = [WKUserContentController new];
    [uc addScriptMessageHandler:self name:@"lj10"];
    WKUserScript *script = [[WKUserScript alloc] initWithSource:[self collectorScript]
                                                  injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                               forMainFrameOnly:NO];
    [uc addUserScript:script];
    config.userContentController = uc;
    config.websiteDataStore = WKWebsiteDataStore.defaultDataStore;

    self.webView = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    self.webView.allowsBackForwardNavigationGestures = YES;
    if (@available(iOS 14.0, *)) self.webView.pageZoom = 0.82;

    self.timerLabel = [UILabel new];
    self.timerLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.timerLabel.textAlignment = NSTextAlignmentLeft;
    self.timerLabel.font = [UIFont monospacedDigitSystemFontOfSize:15 weight:UIFontWeightBold];
    self.timerLabel.textColor = UIColor.systemRedColor;
    self.timerLabel.text = @"ЗАМЕР 00:00 • ПОСЛЕ 10x --:--";

    self.watchLabel = [UILabel new];
    self.watchLabel.translatesAutoresizingMaskIntoConstraints = NO;
    self.watchLabel.textAlignment = NSTextAlignmentCenter;
    self.watchLabel.numberOfLines = 2;
    self.watchLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightHeavy];
    self.watchLabel.text = @"ЖДАТЬ • нажмите «НОВЫЙ ЗАМЕР»";

    self.statusLabel = [UILabel new];
    self.statusLabel.numberOfLines = 2;
    self.statusLabel.font = [UIFont systemFontOfSize:10 weight:UIFontWeightSemibold];
    self.statusLabel.text = @"После старта считаются только новые завершённые коэффициенты ≥10x.";

    self.statsLabel = [UILabel new];
    self.statsLabel.numberOfLines = 1;
    self.statsLabel.font = [UIFont monospacedDigitSystemFontOfSize:10 weight:UIFontWeightSemibold];
    self.statsLabel.text = @"10x+: 0 / 20 • среднее: —";

    self.startButton = [UIButton buttonWithType:UIButtonTypeSystem];
    self.startButton.configuration = [UIButtonConfiguration filledButtonConfiguration];
    [self.startButton setTitle:@"НОВЫЙ ЗАМЕР" forState:UIControlStateNormal];
    [self.startButton addTarget:self action:@selector(startNewSession) forControlEvents:UIControlEventTouchUpInside];

    UIButton *reload = [UIButton buttonWithType:UIButtonTypeSystem];
    reload.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [reload setTitle:@"LuckyJet" forState:UIControlStateNormal];
    [reload addTarget:self action:@selector(loadLuckyJet) forControlEvents:UIControlEventTouchUpInside];

    UIButton *export = [UIButton buttonWithType:UIButtonTypeSystem];
    export.configuration = [UIButtonConfiguration borderedButtonConfiguration];
    [export setTitle:@"Экспорт" forState:UIControlStateNormal];
    [export addTarget:self action:@selector(exportSession) forControlEvents:UIControlEventTouchUpInside];

    self.hideButton = [UIButton buttonWithType:UIButtonTypeSystem];
    self.hideButton.translatesAutoresizingMaskIntoConstraints = NO;
    self.hideButton.backgroundColor = [UIColor colorWithWhite:0.05 alpha:0.88];
    self.hideButton.layer.cornerRadius = 14;
    self.hideButton.layer.borderWidth = 1;
    self.hideButton.layer.borderColor = UIColor.systemRedColor.CGColor;
    [self.hideButton setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    self.hideButton.titleLabel.font = [UIFont systemFontOfSize:10 weight:UIFontWeightBold];
    [self.hideButton setTitle:@"СКРЫТЬ" forState:UIControlStateNormal];
    [self.hideButton addTarget:self action:@selector(toggleControls) forControlEvents:UIControlEventTouchUpInside];

    UIStackView *buttons = [[UIStackView alloc] initWithArrangedSubviews:@[self.startButton, reload, export]];
    buttons.axis = UILayoutConstraintAxisHorizontal;
    buttons.spacing = 4;
    buttons.distribution = UIStackViewDistributionFillEqually;

    self.tableView = [[UITableView alloc] initWithFrame:CGRectZero style:UITableViewStylePlain];
    self.tableView.dataSource = self;
    self.tableView.rowHeight = 36;
    self.tableView.backgroundColor = UIColor.clearColor;

    self.controlsStack = [[UIStackView alloc] initWithArrangedSubviews:@[self.statusLabel, self.statsLabel, buttons, self.tableView]];
    self.controlsStack.translatesAutoresizingMaskIntoConstraints = NO;
    self.controlsStack.axis = UILayoutConstraintAxisVertical;
    self.controlsStack.spacing = 2;

    [self.view addSubview:self.webView];
    [self.view addSubview:self.timerLabel];
    [self.view addSubview:self.watchLabel];
    [self.view addSubview:self.controlsStack];
    [self.view addSubview:self.hideButton];

    self.controlsHeightConstraint = [self.controlsStack.heightAnchor constraintEqualToConstant:205];
    UILayoutGuide *g = self.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [self.timerLabel.topAnchor constraintEqualToAnchor:g.topAnchor constant:2],
        [self.timerLabel.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:8],
        [self.timerLabel.trailingAnchor constraintEqualToAnchor:self.hideButton.leadingAnchor constant:-6],
        [self.timerLabel.heightAnchor constraintEqualToConstant:28],

        [self.hideButton.centerYAnchor constraintEqualToAnchor:self.timerLabel.centerYAnchor],
        [self.hideButton.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-8],
        [self.hideButton.widthAnchor constraintEqualToConstant:72],
        [self.hideButton.heightAnchor constraintEqualToConstant:28],

        [self.watchLabel.topAnchor constraintEqualToAnchor:self.timerLabel.bottomAnchor constant:1],
        [self.watchLabel.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:6],
        [self.watchLabel.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-6],
        [self.watchLabel.heightAnchor constraintGreaterThanOrEqualToConstant:30],

        [self.controlsStack.topAnchor constraintEqualToAnchor:self.watchLabel.bottomAnchor constant:2],
        [self.controlsStack.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:6],
        [self.controlsStack.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-6],
        self.controlsHeightConstraint,
        [self.tableView.heightAnchor constraintEqualToConstant:132],

        [self.webView.topAnchor constraintEqualToAnchor:self.controlsStack.bottomAnchor constant:2],
        [self.webView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor]
    ]];

    [self.view bringSubviewToFront:self.timerLabel];
    [self.view bringSubviewToFront:self.watchLabel];
    [self.view bringSubviewToFront:self.controlsStack];
    [self.view bringSubviewToFront:self.hideButton];

    self.timer = [NSTimer scheduledTimerWithTimeInterval:0.25 target:self selector:@selector(updateTimerUI) userInfo:nil repeats:YES];
    [UIApplication sharedApplication].idleTimerDisabled = YES;
    [self loadLuckyJet];
}

- (void)dealloc {
    [self.timer invalidate];
    [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"lj10"];
    [UIApplication sharedApplication].idleTimerDisabled = NO;
}

- (NSString *)collectorScript {
    NSArray<NSString *> *parts = @[
        @"(function(){",
        @"if(window.__lj10Installed)return;window.__lj10Installed=true;",
        @"var elementState=new WeakMap();var arrState={};var scalarState={};",
        @"function post(obj){try{window.webkit.messageHandlers.lj10.postMessage(obj);}catch(e){}}",
        @"function num(v){if(typeof v==='number')return v;if(typeof v==='string'){var s=v.replace(',','.').replace(/[^0-9.]/g,'');var n=parseFloat(s);return isFinite(n)?n:null;}return null;}",
        @"function emitBig(v,source,ctx){var n=num(v);if(n===null||n<10)return;post({type:'big',value:n,source:source||'unknown',context:String(ctx||'').slice(0,500),url:location.href});}",
        @"function exactX(t){var m=String(t||'').trim().match(/^(\\d{1,3}(?:[\\.,]\\d{1,3})?)\\s*[xX×]$/);return m?parseFloat(m[1].replace(',','.')):null;}",
        @"function scanDom(){try{var nodes=document.querySelectorAll('span,div,li,p,b,strong,td');var now=Date.now();var begin=Math.max(0,nodes.length-1400);for(var i=begin;i<nodes.length;i++){var el=nodes[i];if(!el||el.children.length>3)continue;var text=(el.textContent||'').trim();if(text.length>24)continue;var v=exactX(text);var st=elementState.get(el);if(!st){elementState.set(el,{text:text,changed:now,sent:true});continue;}if(st.text!==text){st.text=text;st.changed=now;st.sent=false;continue;}if(!st.sent&&v!==null&&v>=10&&(now-st.changed)>=1000){st.sent=true;emitBig(v,'dom-stable',text);}}}catch(e){}}",
        @"setInterval(scanDom,280);document.addEventListener('DOMContentLoaded',function(){setTimeout(scanDom,220);});",
        @"function handleArray(key,a,source){var vals=a.map(num).filter(function(x){return x!==null;});if(!vals.length)return;var prev=arrState[key];arrState[key]=vals.slice(0);if(!prev||!prev.length)return;var cand=null;if(vals.length>prev.length){if(vals[0]!==prev[0])cand=vals[0];else cand=vals[vals.length-1];}else if(vals[0]!==prev[0])cand=vals[0];else if(vals[vals.length-1]!==prev[prev.length-1])cand=vals[vals.length-1];if(cand!==null)emitBig(cand,source+':'+key,'array-change');}",
        @"function walk(o,source,depth){if(depth>7||o===null||o===undefined)return;if(Array.isArray(o)){for(var i=0;i<Math.min(o.length,120);i++)walk(o[i],source,depth+1);return;}if(typeof o!=='object')return;Object.keys(o).forEach(function(k){var v=o[k];var lk=k.toLowerCase();if(lk==='stopcoefficients'&&Array.isArray(v)){handleArray(k,v,source);return;}if(/^(stopcoefficient|finalmultiplier|crashpoint|resultcoefficient|resultmultiplier|finalcoefficient)$/i.test(k)){var n=num(v);var old=scalarState[k];scalarState[k]=n;if(old!==undefined&&n!==null&&n!==old)emitBig(n,source+':'+k,'scalar-change');return;}walk(v,source,depth+1);});}",
        @"function inspect(data,source){try{if(typeof data==='string'){var t=data.trim();if(!t)return;try{walk(JSON.parse(t),source,0);}catch(e){var re=/(?:stopCoefficient|finalMultiplier|crashPoint|resultCoefficient|resultMultiplier)[^0-9]{0,20}(\\d{1,3}(?:[\\.,]\\d{1,3})?)/ig,m;while((m=re.exec(t)))emitBig(m[1],source,'raw-key');}}else if(typeof data==='object')walk(data,source,0);}catch(e){}}",
        @"var nativeFetch=window.fetch;if(nativeFetch){window.fetch=function(input,init){var u=(typeof input==='string')?input:(input&&input.url)||'';var p=nativeFetch.apply(this,arguments);try{p.then(function(r){try{r.clone().text().then(function(t){inspect(t,'fetch:'+u);});}catch(e){}});}catch(e){}return p;};}",
        @"var xo=XMLHttpRequest.prototype.open;var xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__lj10url=u;return xo.apply(this,arguments);};XMLHttpRequest.prototype.send=function(){this.addEventListener('load',function(){try{inspect(this.responseText,'xhr:'+(this.__lj10url||''));}catch(e){}});return xs.apply(this,arguments);};",
        @"try{var NativeWS=window.WebSocket;if(NativeWS){function APWS(){var args=[null].concat(Array.prototype.slice.call(arguments));var C=Function.prototype.bind.apply(NativeWS,args);var ws=new C();var u=arguments[0]||'';ws.addEventListener('message',function(ev){inspect(ev.data,'ws:'+u);});return ws;}APWS.prototype=NativeWS.prototype;['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){try{APWS[k]=NativeWS[k];}catch(e){}});window.WebSocket=APWS;}}catch(e){}",
        @"})();"
    ];
    return [parts componentsJoinedByString:@""];
}

- (void)loadLuckyJet {
    NSURL *url = [NSURL URLWithString:LJURLString];
    if (!url) return;
    self.statusLabel.text = @"Загрузка LuckyJet…";
    [self.webView loadRequest:[NSURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:35]];
}

- (void)startNewSession {
    [self.events removeAllObjects];
    self.sessionStartDate = [NSDate date];
    self.lastEventDate = nil;
    self.lastEventValue = 0;
    self.collecting = YES;
    self.acceptAfterDate = [NSDate dateWithTimeIntervalSinceNow:2.0];
    [self.startButton setTitle:@"СБОР ИДЁТ" forState:UIControlStateNormal];
    self.statusLabel.text = @"Считаю только новые завершённые коэффициенты ≥10x после этого момента.";
    [self saveFiles];
    [self.tableView reloadData];
    [self updateStats];
    [self updateTimerUI];
}

- (void)toggleControls {
    self.controlsHidden = !self.controlsHidden;
    [self.hideButton setTitle:(self.controlsHidden ? @"ОТКРЫТЬ" : @"СКРЫТЬ") forState:UIControlStateNormal];
    self.controlsStack.hidden = self.controlsHidden;
    self.controlsHeightConstraint.constant = self.controlsHidden ? 0 : 205;
    [UIView animateWithDuration:0.18 animations:^{ [self.view layoutIfNeeded]; }];
    [self.view bringSubviewToFront:self.hideButton];
    [self.view bringSubviewToFront:self.timerLabel];
    [self.view bringSubviewToFront:self.watchLabel];
}

- (void)acceptBig:(double)value source:(NSString *)source context:(NSString *)context pageURL:(NSString *)pageURL {
    if (!self.collecting || self.events.count >= 20) return;
    NSDate *now = [NSDate date];
    if (self.acceptAfterDate && [now compare:self.acceptAfterDate] == NSOrderedAscending) return;
    if (self.lastEventDate) {
        NSTimeInterval since = [now timeIntervalSinceDate:self.lastEventDate];
        if (since < 3.0) return;
        if (fabs(value - self.lastEventValue) < 0.0001 && since < 20.0) return;
    }
    NSTimeInterval interval = self.lastEventDate ? [now timeIntervalSinceDate:self.lastEventDate] : 0;
    NSDictionary *event = @{
        @"index": @(self.events.count + 1), @"coefficient": @(value),
        @"timestamp": [self.isoFormatter stringFromDate:now], @"timeKyiv": [self.clockFormatter stringFromDate:now],
        @"intervalSeconds": @(interval), @"intervalMinutes": @(interval / 60.0),
        @"source": source ?: @"unknown", @"context": context ?: @"",
        @"pageURL": pageURL ?: self.webView.URL.absoluteString ?: @""
    };
    [self.events addObject:event];
    self.lastEventDate = now;
    self.lastEventValue = value;
    [self saveFiles];
    [self.tableView reloadData];
    [self.tableView scrollToRowAtIndexPath:[NSIndexPath indexPathForRow:self.events.count-1 inSection:0] atScrollPosition:UITableViewScrollPositionBottom animated:YES];
    [self updateStats];
    [self updateTimerUI];
    if (self.events.count >= 20) {
        self.collecting = NO;
        [self.startButton setTitle:@"НОВЫЙ ЗАМЕР" forState:UIControlStateNormal];
        self.statusLabel.text = @"Готово: собрано 20 новых коэффициентов ≥10x.";
        UIAlertController *a = [UIAlertController alertControllerWithTitle:@"Готово" message:@"Собрано 20 новых коэффициентов ≥10x. Экспортируйте JSON/CSV." preferredStyle:UIAlertControllerStyleAlert];
        [a addAction:[UIAlertAction actionWithTitle:@"OK" style:UIAlertActionStyleDefault handler:nil]];
        [self presentViewController:a animated:YES completion:nil];
    }
}

- (void)updateStats {
    double sum = 0; NSInteger intervals = 0;
    for (NSDictionary *e in self.events) { double m = [e[@"intervalMinutes"] doubleValue]; if (m > 0) { sum += m; intervals++; } }
    NSString *avg = intervals ? [NSString stringWithFormat:@"%.2f мин", sum / intervals] : @"—";
    self.statsLabel.text = [NSString stringWithFormat:@"10x+: %lu / 20 • среднее: %@", (unsigned long)self.events.count, avg];
}

- (NSString *)clockTextForInterval:(NSTimeInterval)seconds {
    NSInteger m = (NSInteger)(MAX(0, seconds) / 60.0);
    NSInteger s = (NSInteger)MAX(0, seconds) % 60;
    return [NSString stringWithFormat:@"%02ld:%02ld", (long)m, (long)s];
}

- (BOOL)isTestWindowAtSeconds:(NSTimeInterval)elapsed {
    // Исторические интервалы первых 10 событий: 0.82, 0.86, 1.49, 2.38, 3.15, 4.40, 6.40, 6.70, 6.84 мин.
    const double marks[] = {49.2, 51.6, 89.4, 142.8, 189.0, 264.0, 384.0, 402.0, 410.4};
    const int count = 9;
    for (int i = 0; i < count; i++) {
        if (fabs(elapsed - marks[i]) <= 18.0) return YES;
    }
    return NO;
}

- (void)updateTimerUI {
    NSDate *now = [NSDate date];
    NSTimeInterval sessionElapsed = self.sessionStartDate ? [now timeIntervalSinceDate:self.sessionStartDate] : 0;
    NSString *sessionText = [self clockTextForInterval:sessionElapsed];
    NSString *lastText = self.lastEventDate ? [self clockTextForInterval:[now timeIntervalSinceDate:self.lastEventDate]] : @"--:--";
    self.timerLabel.text = [NSString stringWithFormat:@"ЗАМЕР %@ • ПОСЛЕ 10x %@", sessionText, lastText];

    if (!self.collecting) {
        self.watchLabel.text = @"ЖДАТЬ • нажмите «НОВЫЙ ЗАМЕР»";
        return;
    }
    if (!self.lastEventDate) {
        self.watchLabel.text = @"ЖДАТЬ • ловим первый новый 10x+";
        return;
    }

    NSTimeInterval elapsed = MAX(0, [now timeIntervalSinceDate:self.lastEventDate]);
    if ([self isTestWindowAtSeconds:elapsed]) {
        self.watchLabel.text = @"🧪 ТЕСТ: ОТМЕТИТЬ СЛЕДУЮЩИЙ РАУНД\nокно совпало с одним из прошлых интервалов";
        self.watchLabel.textColor = UIColor.systemRedColor;
    } else {
        self.watchLabel.textColor = UIColor.labelColor;
        if (elapsed < 45) self.watchLabel.text = @"ЖДАТЬ • слишком рано по прошлой выборке";
        else if (elapsed < 450) self.watchLabel.text = @"ЖДАТЬ • следим за таймером и историей";
        else self.watchLabel.text = @"ЖДАТЬ • интервал вышел за прошлый диапазон";
    }
}

- (NSURL *)documentsDirectory { return [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject]; }
- (NSURL *)jsonURL { return [[self documentsDirectory] URLByAppendingPathComponent:@"luckyjet_10x_session.json"]; }
- (NSURL *)csvURL { return [[self documentsDirectory] URLByAppendingPathComponent:@"luckyjet_10x_session.csv"]; }

- (void)saveFiles {
    NSMutableArray *intervals = [NSMutableArray array];
    for (NSDictionary *e in self.events) if ([e[@"intervalSeconds"] doubleValue] > 0) [intervals addObject:e[@"intervalMinutes"] ?: @0];
    double avg = 0; for (NSNumber *n in intervals) avg += n.doubleValue; if (intervals.count) avg /= intervals.count;
    NSDictionary *payload = @{
        @"format": @"LuckyJet10xCollector/3", @"rule": @"new completed coefficients >= 10.00x only",
        @"targetCount": @20, @"collectedCount": @(self.events.count), @"timezone": @"Europe/Kyiv",
        @"sourceURL": LJURLString, @"averageIntervalMinutes": @(avg),
        @"referenceFirst10": @{@"meanMinutes": @3.670, @"medianMinutes": @3.146, @"minMinutes": @0.821, @"maxMinutes": @6.837},
        @"events": self.events
    };
    NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingPrettyPrinted error:nil];
    [json writeToURL:[self jsonURL] atomically:YES];
    NSMutableString *csv = [NSMutableString stringWithString:@"index,coefficient,timeKyiv,timestamp,intervalSeconds,intervalMinutes,source,pageURL\n"];
    for (NSDictionary *e in self.events) {
        NSString *line = [NSString stringWithFormat:@"%@,%.3f,%@,%@,%.3f,%.3f,\"%@\",\"%@\"\n",
                          e[@"index"], [e[@"coefficient"] doubleValue], e[@"timeKyiv"], e[@"timestamp"],
                          [e[@"intervalSeconds"] doubleValue], [e[@"intervalMinutes"] doubleValue],
                          [[e[@"source"] description] stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""],
                          [[e[@"pageURL"] description] stringByReplacingOccurrencesOfString:@"\"" withString:@"\"\""]];
        [csv appendString:line];
    }
    [csv writeToURL:[self csvURL] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

- (void)exportSession {
    [self saveFiles];
    UIActivityViewController *vc = [[UIActivityViewController alloc] initWithActivityItems:@[[self jsonURL], [self csvURL]] applicationActivities:nil];
    if (vc.popoverPresentationController) vc.popoverPresentationController.sourceView = self.view;
    [self presentViewController:vc animated:YES completion:nil];
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"lj10"] || ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *d = message.body;
    if ([[d[@"type"] description] isEqualToString:@"big"]) [self acceptBig:[d[@"value"] doubleValue] source:[d[@"source"] description] context:[d[@"context"] description] pageURL:[d[@"url"] description]];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if (!self.collecting) self.statusLabel.text = @"LuckyJet открыт. Когда видны раунды — нажмите «НОВЫЙ ЗАМЕР».";
    [self.view bringSubviewToFront:self.hideButton];
    [self.view bringSubviewToFront:self.timerLabel];
    [self.view bringSubviewToFront:self.watchLabel];
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error { self.statusLabel.text = [NSString stringWithFormat:@"Ошибка: %@", error.localizedDescription ?: @"неизвестно"]; }
- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures { if (navigationAction.request.URL) [webView loadRequest:navigationAction.request]; return nil; }

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section { return self.events.count; }
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"event"];
    if (!cell) cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleSubtitle reuseIdentifier:@"event"];
    NSDictionary *e = self.events[indexPath.row];
    double seconds = [e[@"intervalSeconds"] doubleValue]; NSInteger m = (NSInteger)(seconds / 60.0); NSInteger s = (NSInteger)seconds % 60;
    NSString *intervalText = indexPath.row == 0 ? @"первый" : [NSString stringWithFormat:@"+%02ld:%02ld", (long)m, (long)s];
    cell.textLabel.font = [UIFont monospacedDigitSystemFontOfSize:11 weight:UIFontWeightBold];
    cell.detailTextLabel.font = [UIFont systemFontOfSize:9 weight:UIFontWeightRegular];
    cell.textLabel.text = [NSString stringWithFormat:@"#%@ %.2fx • %@ • %@", e[@"index"], [e[@"coefficient"] doubleValue], e[@"timeKyiv"], intervalText];
    cell.detailTextLabel.text = e[@"source"] ?: @"";
    return cell;
}
@end

@interface LJAppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end
@implementation LJAppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:[LJCollectorViewController new]];
    self.window.rootViewController = nav; [self.window makeKeyAndVisible]; return YES;
}
@end

int main(int argc, char * argv[]) { @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass([LJAppDelegate class])); } }
