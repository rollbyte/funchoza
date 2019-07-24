<?php
namespace caviar\tests;

use PHPUnit\Framework\TestCase;
use Facebook\WebDriver\Remote\RemoteWebDriver;
use Facebook\WebDriver\WebDriverBy;
use Facebook\WebDriver\Chrome\ChromeOptions;
use Facebook\WebDriver\WebDriverKeys;
use Facebook\WebDriver\WebDriverExpectedCondition;

class BasicTest extends TestCase {
    protected static $wd;
    
    public static function setUpBeforeClass(): void
    {
        $selenium = $_ENV['SELENIUM_URL'] ?? 'http://localhost:4444';
        $opts = new ChromeOptions();
        $opts->addArguments(['--headless', '--no-sandbox', '--disable-dev-shm-usage']);
        $opts->setExperimentalOption('w3c', false);
        self::$wd = RemoteWebDriver::create($selenium.'/wd/hub', $opts->toCapabilities());
        self::$wd->get('file://'.__DIR__ . '/tests.html')
            ->wait(5)
            ->until(WebDriverExpectedCondition::visibilityOfElementLocated(WebDriverBy::id('deferred_text')));
    }
    
    public function testDataBinding(): void
    {
        $bc1 = self::$wd->findElement(WebDriverBy::id('bind_checker_1'));
        $bc2 = self::$wd->findElement(WebDriverBy::id('bind_checker_2'));
        $bc3 = self::$wd->findElement(WebDriverBy::id('bind_checker_3'));

        $markup = self::$wd->findElement(WebDriverBy::id('markup_test'));
        $this->assertNotEmpty($markup, 'cvr-html binding test failed');
        
        $this->assertEquals('some meaningless text', $bc1->getAttribute('value'), 'cvr-get binding read check test failed');
        $this->assertEquals('some meaningless text', $bc2->getAttribute('value'), 'cvr-data binding read check test failed');
        $this->assertEmpty($bc3->getAttribute('value'), 'cvr-set binding read check test failed');
        $bc2->click();
        $bc2->clear();
        $bc2->sendKeys("test test test\n");
        $this->assertEquals($bc2->getAttribute('value'), $bc1->getAttribute('value'), 'cvr-data binding test failed');
        $bc3->click();
        $bc3->clear();
        $bc3->sendKeys("second test text\n");
        $this->assertEquals($bc2->getAttribute('value'), $bc3->getAttribute('value'), 'cvr-set binding write check test failed');
        $this->assertEquals($bc1->getAttribute('value'), $bc3->getAttribute('value'), 'cvr-set binding write check test failed');
    }
    
    public function testEditorTypes(): void
    {
        $cbck = self::$wd->findElement(WebDriverBy::id('checkbox_checker'));
        $this->assertEquals(false, $cbck->getAttribute('checked'), 'checkbox read binding test failed');
        $this->assertEquals('none', $cbck->getCSSValue('display'), 'negative cvr-if binding test failed');
        
        $cb = self::$wd->findElement(WebDriverBy::id('input_checker_checkbox'));
        $cb->click();
        $check = self::$wd->executeScript('return model.nested.boolVal');
        $this->assertTrue($check, 'checkbox write binding test failed');
        $this->assertEquals('block', $cbck->getCSSValue('display'), 'positive cvr-if binding test failed');
        
        $text = self::$wd->findElement(WebDriverBy::id('input_checker_text'));
        $textarea = self::$wd->findElement(WebDriverBy::id('input_checker_textarea'));
        $select = self::$wd->findElement(WebDriverBy::id('input_checker_select'));
        
        $radio1 = self::$wd->findElement(WebDriverBy::id('input_checker_radio_1'));
        $radio2 = self::$wd->findElement(WebDriverBy::id('input_checker_radio_2'));
        $radio3 = self::$wd->findElement(WebDriverBy::id('input_checker_radio_3'));
        
        $this->assertEquals('val 2', $text->getAttribute('value'), 'text input read binding test failed');
        $this->assertEquals('val 2', $textarea->getAttribute('value'), 'textarea read binding test failed');
        $this->assertEquals('true', $select->findElement(WebDriverBy::xpath('option[@value="val 2"]'))->getAttribute('checked'), 'select read binding test failed');
        $this->assertEquals('true', $radio2->getAttribute('checked'), 'radio input read binding test failed');
        
        $textarea->click();
        $textarea->clear();
        $textarea->sendKeys("val 3");
        self::$wd->getKeyboard()->pressKey(WebDriverKeys::TAB);
        $this->assertEquals('val 3', $text->getAttribute('value'), 'text input read binding second test failed');
        $this->assertEquals('true', $select->findElement(WebDriverBy::xpath('option[@value="val 3"]'))->getAttribute('checked'), 'select read binding second test failed');
        $this->assertEquals('true', $radio3->getAttribute('checked'), 'radio input read binding second test failed');
        
        $radio1->click();
        $this->assertEquals('val 1', $text->getAttribute('value'), 'text input read binding second test failed');
        $this->assertEquals('val 1', $textarea->getAttribute('value'), 'textarea read binding second test failed');
        $this->assertEquals('true', $select->findElement(WebDriverBy::xpath('option[@value="val 1"]'))->getAttribute('checked'), 'select read binding third test failed');
        
        $select->findElement(WebDriverBy::xpath('option[@value="val 2"]'))->click();
        $this->assertEquals('val 2', $text->getAttribute('value'), 'text input read binding third test failed');
        $this->assertEquals('val 2', $textarea->getAttribute('value'), 'textarea read binding third test failed');
        $this->assertEquals('true', $radio2->getAttribute('checked'), 'radio input read binding third test failed');
    }
    
    public function testStyles(): void
    {
        $a = self::$wd->findElement(WebDriverBy::id('styles_class_checker'));
        $this->assertEquals('rgba(255, 0, 0, 1)', $a->getCSSValue('background-color'), 'style binding by attribute test failed');
        $this->assertEquals('rgba(255, 255, 255, 1)', $a->getCSSValue('color'), 'style binding by method test failed');
        
        $colorSelector = self::$wd->findElement(WebDriverBy::id('bg_color_selector'));
        $colorSelector->findElement(WebDriverBy::xpath('option[@value="white"]'))->click();
        $this->assertEquals('rgba(255, 255, 255, 1)', $a->getCSSValue('background-color'), 'style binding by attribute edit test failed');
        $this->assertEquals('rgba(0, 0, 0, 1)', $a->getCSSValue('color'), 'style binding by method edit test failed');
    }
    
    public function testClasses(): void
    {
        $a = self::$wd->findElement(WebDriverBy::id('styles_class_checker'));
        $this->assertEquals('5px', $a->getCSSValue('padding'), 'class binding by attribute test failed');
        $this->assertEquals('inline-block', $a->getCSSValue('display'), 'class binding by attribute test failed');
        $cls = self::$wd->findElement(WebDriverBy::id('some_class_setter'));
        $cls->click();
        $this->assertNotEquals('5px', $a->getCSSValue('padding'), 'class binding by attribute edit test failed');
        $this->assertNotEquals('inline-block', $a->getCSSValue('display'), 'class binding by attribute edit test failed');
    }
    
    public function testAttrs(): void
    {
        $a = self::$wd->findElement(WebDriverBy::id('styles_class_checker'));
        $this->assertEquals('http://www.google.com/', $a->getAttribute('href'), 'attribute binding by attribute test failed');
        $href_editor = self::$wd->findElement(WebDriverBy::id('link_setter'));
        $href_editor->click();
        $href_editor->clear();
        $href_editor->sendKeys("http://www.facebook.com\n");
        $this->assertEquals('http://www.facebook.com/', $a->getAttribute('href'), 'attribute binding by attribute edit test failed');
    }
    
    public function testFormulas(): void
    {
        $calc1 = self::$wd->findElement(WebDriverBy::id('calc_1'));
        $calc2 = self::$wd->findElement(WebDriverBy::id('calc_2'));
        $calc3 = self::$wd->findElement(WebDriverBy::id('calc_3'));
        $calc4 = self::$wd->findElement(WebDriverBy::id('calc_4'));
        
        $this->assertEquals('46', $calc1->getText(), 'first formula initial calculation failed');
        $this->assertEquals('13', $calc2->getText(), 'second formula initial calculation failed');
        $this->assertEquals('150', $calc3->getText(), 'third formula initial calculation failed');
        $this->assertEquals('150', $calc4->getText(), 'fourth formula initial calculation failed');
        
        $feditor = self::$wd->findElement(WebDriverBy::id('input_f'));
        $feditor->click();
        $feditor->clear();
        $feditor->sendKeys("L100\n");
        
        $this->assertEquals('L100.50', $calc3->getText(), 'third formula on f edit calculation failed');
        $this->assertEquals('L100.50', $calc4->getText(), 'fourth formula on f edit calculation failed');
        
        $beditor = self::$wd->findElement(WebDriverBy::id('input_b'));
        $beditor->click();
        $beditor->clear();
        $beditor->sendKeys("4\n");
        $deditor = self::$wd->findElement(WebDriverBy::id('input_d'));
        $deditor->click();
        $deditor->clear();
        $deditor->sendKeys("9\n");
        $this->assertEquals('46', $calc1->getText(), 'first formula on b & d edit calculation failed');
        $this->assertEquals('21', $calc2->getText(), 'second formula on b & d edit calculation failed');

        $beditor->click();
        $beditor->clear();
        $beditor->sendKeys("2\n");
        $ceditor = self::$wd->findElement(WebDriverBy::id('input_c'));
        $ceditor->click();
        $ceditor->clear();
        $ceditor->sendKeys("2\n");
        $this->assertEquals('40', $calc1->getText(), 'first formula on b & c edit calculation failed');
        $this->assertEquals('13', $calc2->getText(), 'second formula on b & c edit calculation failed');
        
        $deditor->click();
        $deditor->clear();
        $deditor->sendKeys("1\n");
        $this->assertEquals('40', $calc1->getText(), 'first formula on d edit calculation failed');
        $this->assertEquals('5', $calc2->getText(), 'second formula on d edit calculation failed');
        
        $deditor->click();
        $deditor->clear();
        $deditor->sendKeys("2\n");
        $this->assertEquals('L100:50', $calc1->getText(), 'first formula on last edit calculation failed');
        $this->assertEquals('6', $calc2->getText(), 'second formula on last edit calculation failed');
    }
    
    public function testForEach(): void
    {
        $newItemText = self::$wd->findElement(WebDriverBy::id('new_item_text'));
        $newItemText->click();
        $newItemText->clear();
        $newItemText->sendKeys("item # 1\n");
        
        $newItemAdd = self::$wd->findElement(WebDriverBy::id('add_new_item'));
        $newItemAdd->click();
        
        $newItemText->click();
        $newItemText->clear();
        $newItemText->sendKeys("item # 2\n");

        $newItemAdd->click();
        
        $newItemText->click();
        $newItemText->clear();
        $newItemText->sendKeys("item # 3\n");
        
        $newItemAdd->click();
        
        $itemTree = self::$wd->findElement(WebDriverBy::id('item_tree'));
        $items = $itemTree->findElements(WebDriverBy::cssSelector('.item'));
        $this->assertEquals(3, count($items), 'cvr-foreach and cvr-tpl test failed');
        
        $second_item = self::$wd->findElement(WebDriverBy::id('item_2'));
        $second_item->click();
        
        $second_item_title = $second_item->findElement(WebDriverBy::cssSelector('.item'));
        $this->assertEquals('rgba(0, 0, 128, 1)', $second_item_title->getCSSValue('background-color'), 'select second item check failed');
        
        $newItemText->click();
        $newItemText->clear();
        $newItemText->sendKeys("item # 4\n");
        
        $newItemAdd->click();
        
        $newItemText->click();
        $newItemText->clear();
        $newItemText->sendKeys("item # 5\n");
        
        $newItemAdd->click();
        
        $fifth_item = self::$wd->findElement(WebDriverBy::id('item_5'));
        $fifth_item->click();
        $fifth_item_title = $fifth_item->findElement(WebDriverBy::cssSelector('.item'));
        $this->assertEquals('rgba(0, 0, 128, 1)', $fifth_item_title->getCSSValue('background-color'), 'root scope call check failed');
        
        
        $first_item = self::$wd->findElement(WebDriverBy::id('item_1'));
        $first_item->click();

        $first_item_title = $first_item->findElement(WebDriverBy::cssSelector('.item'));
        $this->assertEquals('rgba(0, 0, 128, 1)', $first_item_title->getCSSValue('background-color'), 'select first item check failed');
        $this->assertEquals('rgba(0, 0, 0, 0)', $fifth_item_title->getCSSValue('background-color'), 'cvr-watch-parent check failed');
        
        $fifth_item->click();
        $this->assertEquals('rgba(0, 0, 0, 0)', $first_item_title->getCSSValue('background-color'), 'cvr-watch-children check failed');
        
        
        $done_button = $fifth_item_title->findElement(WebDriverBy::cssSelector('button.don'));
        $this->assertTrue($done_button->isDisplayed(), 'cvr-if by formula check failed');
        $done_button->click();
        $this->assertFalse($done_button->isDisplayed(), 'cvr-if by formula second check failed');
        $del_button = $fifth_item_title->findElement(WebDriverBy::cssSelector('button.del'));
        $del_button->click();
        
        $items = $itemTree->findElements(WebDriverBy::cssSelector('.item'));
        $this->assertEquals(4, count($items), 'parent scope call test failed');
    }
    
    public function testApi(): void
    {
        $deferred_text = self::$wd->findElement(WebDriverBy::id('deferred_text'));
        $this->assertEquals('Yo!!!', $deferred_text->getText(), 'launch, bind, redraw call test failed.');
        
        $override1 = self::$wd->findElement(WebDriverBy::id('override_member_1'));
        $override1->click();
        $this->assertEquals('Oooops!', $deferred_text->getText(), 'cvrize and redraw call test failed.');
        $override2 = self::$wd->findElement(WebDriverBy::id('override_member_2'));
        $override2->click();
        $this->assertEquals('Woow!', $deferred_text->getText(), 'cvrize and redrawElement call test failed.');
        $model = self::$wd->findElement(WebDriverBy::id('deferred_model'));
        $obj = json_decode($model->getText());
        $this->assertEquals('Woow!', $obj->text, 'elementScope call test failed');
        
        $before_counter = self::$wd->findElement(WebDriverBy::id('before_counter'));
        $after_counter = self::$wd->findElement(WebDriverBy::id('after_counter'));
        $this->assertEquals('3', $before_counter->getText(), 'beforeRedraw event handling test failed');
        $this->assertEquals($before_counter->getText(), $after_counter->getText(), 'afterRedraw event handling test failed');
    }
    
    public static function tearDownAfterClass(): void
    {
        self::$wd->close();
    }
}